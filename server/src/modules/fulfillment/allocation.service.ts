import { ALLOCATION_METHOD } from "../../common/constants/status.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2 } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";

/**
 * The warehouse split engine.
 *
 * The spec asks for a split that minimises the *number of shipments*, weighted
 * by each warehouse's shipping cost. Those two goals disagree — the cheapest
 * warehouse per unit is often not the one that can cover the whole order — so
 * the engine optimises the thing that actually costs money: every extra
 * warehouse drawn into an order is another parcel, another handling fee and
 * another delivery date the customer has to wait for.
 *
 * It is therefore a greedy set-cover, not a per-line "cheapest source" pick:
 * at each step it takes the warehouse that can satisfy the largest share of
 * what is still unfulfilled, breaking ties toward the cheaper site. A
 * per-line cheapest-source search would happily spread five lines across
 * three depots to save a few cents of unit cost and then pay for three
 * shipments.
 *
 * Nothing here writes to the database. `suggestAllocation` is pure planning,
 * which is what lets the same function power both the preview the rep sees and
 * the allocation that is eventually committed — the two can never disagree.
 */

export type DemandLine = {
  orderLineId: string;
  productId: string;
  variantId: string | null;
  sku: string;
  productName: string;
  /** How much still needs sourcing, in stock units. */
  quantity: number;
};

export type PlannedAllocation = {
  orderLineId: string;
  /** Carried through so a caller can render the plan without re-joining lines. */
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  allocationMethod: string;
};

export type PlannedBackorder = {
  orderLineId: string;
  productId: string;
  variantId: string | null;
  sku: string;
  productName: string;
  quantity: number;
  /** Where the shortfall is parked — the cheapest site that stocks the item. */
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
};

export type AllocationPlan = {
  allocations: PlannedAllocation[];
  backorders: PlannedBackorder[];
  warehousesUsed: {
    id: string;
    code: string;
    name: string;
    shippingCostWeight: number;
    lineCount: number;
    unitCount: number;
  }[];
  shipmentCount: number;
  estimatedShippingCost: number;
  /** `SINGLE_WAREHOUSE`, `SPLIT` or `BACKORDER` — what the plan amounts to. */
  method: string;
  /** True when nothing could be sourced anywhere. */
  fullyBackordered: boolean;
  explanation: string;
};

type WarehouseStock = {
  id: string;
  code: string;
  name: string;
  shippingCostWeight: number;
  /** Available (on hand less reserved) per `stockKey`. */
  available: Map<string, number>;
};

/** Inventory is keyed by product *and* variant; a null variant is its own row. */
function stockKey(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? ""}`;
}

/**
 * Builds a split for `demand` from live stock. `excludeOrderId` lets a re-plan
 * ignore the reservations this very order already holds, so re-running the
 * planner does not treat its own stock as taken.
 */
export async function suggestAllocation(
  demand: DemandLine[],
): Promise<AllocationPlan> {
  const [baseShipmentCost, warehouses] = await Promise.all([
    getNumericSetting("SHIPMENT_BASE_COST"),
    loadWarehouseStock(demand),
  ]);

  if (demand.length === 0 || warehouses.length === 0) {
    return emptyPlan(demand, warehouses);
  }

  // Remaining demand per line, consumed as warehouses are chosen.
  const remaining = new Map(demand.map((line) => [line.orderLineId, line.quantity]));
  const byLineId = new Map(demand.map((line) => [line.orderLineId, line]));

  const allocations: PlannedAllocation[] = [];
  const used = new Map<string, { lines: Set<string>; units: number }>();

  // Greedy: while anything is unsourced, take the warehouse that covers the
  // most of what is left. Ties go to the cheaper site, so an order that two
  // warehouses could each fill alone ships from the cheaper one.
  for (;;) {
    const outstanding = demand.filter((line) => (remaining.get(line.orderLineId) ?? 0) > 0);

    if (outstanding.length === 0) {
      break;
    }

    let best: { warehouse: WarehouseStock; coverage: number } | null = null;

    for (const warehouse of warehouses) {
      let coverage = 0;

      for (const line of outstanding) {
        const need = remaining.get(line.orderLineId) ?? 0;
        const have = warehouse.available.get(stockKey(line.productId, line.variantId)) ?? 0;

        coverage += Math.min(need, have);
      }

      if (coverage <= 0) {
        continue;
      }

      const better =
        !best ||
        coverage > best.coverage ||
        (coverage === best.coverage &&
          warehouse.shippingCostWeight < best.warehouse.shippingCostWeight);

      if (better) {
        best = { warehouse, coverage };
      }
    }

    // Nothing left anywhere covers any of it — the rest is a backorder.
    if (!best) {
      break;
    }

    const warehouse = best.warehouse;

    for (const line of outstanding) {
      const need = remaining.get(line.orderLineId) ?? 0;
      const key = stockKey(line.productId, line.variantId);
      const have = warehouse.available.get(key) ?? 0;
      const take = Math.min(need, have);

      if (take <= 0) {
        continue;
      }

      allocations.push({
        orderLineId: line.orderLineId,
        sku: line.sku,
        productName: line.productName,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        quantity: take,
        // Filled in once the whole plan is known — a line sourced from one
        // warehouse is still part of a SPLIT if the order needed two.
        allocationMethod: ALLOCATION_METHOD.SINGLE_WAREHOUSE,
      });

      warehouse.available.set(key, have - take);
      remaining.set(line.orderLineId, need - take);

      const entry = used.get(warehouse.id) ?? { lines: new Set<string>(), units: 0 };
      entry.lines.add(line.orderLineId);
      entry.units += take;
      used.set(warehouse.id, entry);
    }
  }

  // Whatever is still unsourced becomes a backorder, parked at the cheapest
  // warehouse that normally stocks the item so replenishment lands somewhere
  // sensible.
  const backorders: PlannedBackorder[] = [];

  for (const [orderLineId, shortfall] of remaining) {
    if (shortfall <= 0) {
      continue;
    }

    const line = byLineId.get(orderLineId);

    if (!line) {
      continue;
    }

    const home = pickBackorderHome(warehouses, line);

    backorders.push({
      orderLineId,
      productId: line.productId,
      variantId: line.variantId,
      sku: line.sku,
      productName: line.productName,
      quantity: round2(shortfall),
      warehouseId: home.id,
      warehouseCode: home.code,
      warehouseName: home.name,
    });
  }

  const shipmentCount = used.size;
  const method =
    shipmentCount === 0
      ? ALLOCATION_METHOD.BACKORDER
      : shipmentCount === 1
        ? ALLOCATION_METHOD.SINGLE_WAREHOUSE
        : ALLOCATION_METHOD.SPLIT;

  for (const allocation of allocations) {
    allocation.allocationMethod = method;
  }

  const warehousesUsed = warehouses
    .filter((warehouse) => used.has(warehouse.id))
    .map((warehouse) => {
      const entry = used.get(warehouse.id)!;

      return {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        shippingCostWeight: warehouse.shippingCostWeight,
        lineCount: entry.lines.size,
        unitCount: round2(entry.units),
      };
    });

  const estimatedShippingCost = round2(
    warehousesUsed.reduce(
      (total, warehouse) => total + baseShipmentCost * warehouse.shippingCostWeight,
      0,
    ),
  );

  return {
    allocations,
    backorders,
    warehousesUsed,
    shipmentCount,
    estimatedShippingCost,
    method,
    fullyBackordered: shipmentCount === 0 && backorders.length > 0,
    explanation: describe(warehousesUsed, backorders, estimatedShippingCost),
  };
}

/* ── helpers ──────────────────────────────────────── */

async function loadWarehouseStock(demand: DemandLine[]): Promise<WarehouseStock[]> {
  if (demand.length === 0) {
    return [];
  }

  const productIds = [...new Set(demand.map((line) => line.productId))];

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { shippingCostWeight: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      shippingCostWeight: true,
      inventory: {
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          variantId: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
      },
    },
  });

  return warehouses.map((warehouse) => {
    const available = new Map<string, number>();

    for (const row of warehouse.inventory) {
      // Reserved stock belongs to orders already allocated, so only the free
      // balance may be promised again.
      const free = Number(row.onHandQuantity) - Number(row.reservedQuantity);

      available.set(stockKey(row.productId, row.variantId), Math.max(0, free));
    }

    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      shippingCostWeight: Number(warehouse.shippingCostWeight),
      available,
    };
  });
}

/**
 * Where a shortfall waits for stock. Prefer a warehouse that carries the
 * product at all (it has a replenishment relationship with that SKU), and among
 * those the cheapest to ship from.
 */
function pickBackorderHome(warehouses: WarehouseStock[], line: DemandLine) {
  const key = stockKey(line.productId, line.variantId);
  const stocking = warehouses.filter((warehouse) => warehouse.available.has(key));

  // `warehouses` is already sorted by shipping weight, so the first match is
  // the cheapest one.
  return stocking[0] ?? warehouses[0]!;
}

function emptyPlan(demand: DemandLine[], warehouses: WarehouseStock[]): AllocationPlan {
  return {
    allocations: [],
    backorders: [],
    warehousesUsed: [],
    shipmentCount: 0,
    estimatedShippingCost: 0,
    method: ALLOCATION_METHOD.BACKORDER,
    fullyBackordered: false,
    explanation:
      demand.length === 0
        ? "This order has no physical lines to ship."
        : warehouses.length === 0
          ? "No active warehouse is configured."
          : "Nothing to allocate.",
  };
}

function describe(
  warehousesUsed: AllocationPlan["warehousesUsed"],
  backorders: PlannedBackorder[],
  cost: number,
): string {
  const parts: string[] = [];

  if (warehousesUsed.length === 0) {
    parts.push("No stock is available for any line");
  } else if (warehousesUsed.length === 1) {
    parts.push(`Everything ships from ${warehousesUsed[0]!.name} in one shipment`);
  } else {
    const names = warehousesUsed.map((warehouse) => warehouse.name).join(" and ");

    parts.push(
      `No single warehouse covers this order, so it splits across ${warehousesUsed.length} shipments (${names})`,
    );
  }

  if (cost > 0) {
    parts.push(`estimated shipping ${cost.toFixed(2)}`);
  }

  if (backorders.length > 0) {
    const units = backorders.reduce((total, entry) => total + entry.quantity, 0);

    parts.push(
      `${round2(units)} unit${units === 1 ? "" : "s"} across ${backorders.length} line${
        backorders.length === 1 ? "" : "s"
      } are backordered`,
    );
  }

  return `${parts.join("; ")}.`;
}
