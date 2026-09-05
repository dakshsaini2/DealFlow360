import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  ALLOCATION_METHOD,
  AUDIT_ACTION,
  BACKORDER_STATUS,
  FULFILLMENT_STATUS,
  LINE_TYPE,
  ORDER_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import {
  suggestAllocation,
  type AllocationPlan,
  type DemandLine,
} from "./allocation.service.js";
import type { OverrideInput, ShipInput } from "./fulfillment.types.js";

/**
 * Only physical goods are sourced from a warehouse. A support contract or a
 * cloud subscription on the same order has nothing to pick, so it is excluded
 * from the split rather than being allocated a phantom quantity.
 */
const PHYSICAL_PRODUCT_TYPE = "GOODS";

/** The client Prisma hands an interactive transaction — no nested `$transaction`. */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const ALLOCATION_SELECT = {
  id: true,
  orderLineId: true,
  warehouseId: true,
  allocatedQuantity: true,
  fulfilledQuantity: true,
  backorderedQuantity: true,
  allocationMethod: true,
  warehouse: {
    select: { id: true, code: true, name: true, shippingCostWeight: true },
  },
  orderLine: {
    select: {
      id: true,
      quantity: true,
      product: { select: { id: true, sku: true, name: true, unit: true } },
      variant: { select: { id: true, sku: true, name: true } },
    },
  },
} as const;

/**
 * The fulfillment picture for an order: the committed plan if one exists, and
 * always a freshly computed suggestion so the screen can show what the engine
 * would do with stock as it stands right now.
 */
export async function getFulfillment(user: AuthUser, orderId: string) {
  const order = await loadOrder(user, orderId);
  const demand = toDemand(order.lines);

  const fulfillmentOrder = await prisma.fulfillmentOrder.findFirst({
    where: { orderId, status: { not: FULFILLMENT_STATUS.CANCELLED } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      estimatedShipmentCount: true,
      estimatedShippingCost: true,
      actualShippingCost: true,
      expectedShipDate: true,
      shippedAt: true,
      createdAt: true,
      allocations: { orderBy: { createdAt: "asc" }, select: ALLOCATION_SELECT },
    },
  });

  const backorders = await prisma.backorder.findMany({
    where: {
      orderLine: { orderId },
      status: { in: [BACKORDER_STATUS.OPEN, BACKORDER_STATUS.CONSOLIDATED] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderLineId: true,
      productId: true,
      quantity: true,
      status: true,
      expectedRestockDate: true,
      consolidatedAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      product: { select: { id: true, sku: true, name: true } },
    },
  });

  // Once stock has arrived for an open backorder there is a better plan
  // available than the one on file. Surfacing that is what drives the
  // "Consolidate remaining backorder" prompt the spec asks for.
  const consolidatable = fulfillmentOrder
    ? await findConsolidatable(backorders)
    : [];

  // Once stock is committed the plan on file *is* the plan. Re-running the
  // engine here would re-plan the same demand against stock this very order has
  // already reserved, and report a split that nobody asked for.
  const plan = fulfillmentOrder
    ? await summariseCommitted(fulfillmentOrder, backorders)
    : await suggestAllocation(demand);

  return {
    order: serialize({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      currencyCode: order.currencyCode,
      promisedDeliveryDate: order.promisedDeliveryDate,
      customer: order.customer,
    }),
    fulfillment: fulfillmentOrder ? serialize(fulfillmentOrder) : null,
    backorders: serialize(backorders),
    /** The committed split once allocated, otherwise what the engine proposes. */
    plan,
    /** True while `plan` is still only a proposal. */
    isProposal: fulfillmentOrder === null,
    nonPhysicalLines: order.lines
      .filter((line) => line.product.productType !== PHYSICAL_PRODUCT_TYPE)
      .map((line) => ({
        orderLineId: line.id,
        sku: line.product.sku,
        name: line.product.name,
        lineType: line.lineType,
      })),
    consolidatable: serialize(consolidatable),
  };
}

/**
 * Commits the engine's suggested split. Accepting is what actually reserves
 * stock — until then the plan is only advice, and two reps could be shown the
 * same units.
 */
export async function acceptSuggestion(user: AuthUser, orderId: string) {
  const order = await loadOrder(user, orderId);

  assertAllocatable(order.status);
  await assertNoOpenFulfillment(orderId);

  const plan = await suggestAllocation(toDemand(order.lines));

  if (plan.allocations.length === 0 && plan.backorders.length === 0) {
    throw new ValidationError("This order has nothing to fulfill", [
      "lines: no physical goods on this order",
    ]);
  }

  return commitPlan(user, orderId, plan, "Accepted the suggested split");
}

/**
 * A manual split. Finance owns the exception, but the numbers still have to add
 * up — the override is checked against the order lines and against live stock,
 * so "manual" never means "unvalidated".
 */
export async function overrideAllocation(
  user: AuthUser,
  orderId: string,
  input: OverrideInput,
) {
  const order = await loadOrder(user, orderId);

  assertAllocatable(order.status);
  await assertNoOpenFulfillment(orderId);

  const demand = toDemand(order.lines);
  const demandByLine = new Map(demand.map((line) => [line.orderLineId, line]));

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, shippingCostWeight: true },
  });
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

  const details: string[] = [];
  const perLine = new Map<string, number>();

  for (const entry of input.allocations) {
    if (!demandByLine.has(entry.orderLineId)) {
      details.push(`allocations: ${entry.orderLineId} is not a physical line on this order`);
      continue;
    }

    if (!warehouseById.has(entry.warehouseId)) {
      details.push(`allocations: ${entry.warehouseId} is not an active warehouse`);
      continue;
    }

    perLine.set(entry.orderLineId, (perLine.get(entry.orderLineId) ?? 0) + entry.quantity);
  }

  for (const [orderLineId, allocated] of perLine) {
    const line = demandByLine.get(orderLineId)!;

    if (round2(allocated) > line.quantity) {
      details.push(
        `allocations: ${line.sku} allocates ${round2(allocated)} but the order line is only ${line.quantity}`,
      );
    }
  }

  // Manual or not, stock that is already promised to another order cannot be
  // promised again.
  const availability = await availableByWarehouse(demand);

  for (const entry of input.allocations) {
    const line = demandByLine.get(entry.orderLineId);

    if (!line) continue;

    const key = `${entry.warehouseId}:${line.productId}:${line.variantId ?? ""}`;
    const free = availability.get(key) ?? 0;

    if (entry.quantity > free) {
      const warehouse = warehouseById.get(entry.warehouseId);

      details.push(
        `allocations: ${warehouse?.code ?? entry.warehouseId} has only ${round2(free)} of ${line.sku} free, ${entry.quantity} requested`,
      );
    }
  }

  if (details.length > 0) {
    throw new ValidationError("This split does not add up", details);
  }

  const baseShipmentCost = await getNumericSetting("SHIPMENT_BASE_COST");
  const usedIds = [...new Set(input.allocations.map((entry) => entry.warehouseId))];
  const method =
    usedIds.length === 0
      ? ALLOCATION_METHOD.BACKORDER
      : usedIds.length === 1
        ? ALLOCATION_METHOD.SINGLE_WAREHOUSE
        : ALLOCATION_METHOD.SPLIT;

  const plan: AllocationPlan = {
    allocations: input.allocations.map((entry) => {
      const warehouse = warehouseById.get(entry.warehouseId)!;
      const line = demandByLine.get(entry.orderLineId)!;

      return {
        orderLineId: entry.orderLineId,
        sku: line.sku,
        productName: line.productName,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        quantity: entry.quantity,
        allocationMethod: method,
      };
    }),
    // Anything the override did not source is a backorder, exactly as it would
    // be under the automatic plan.
    backorders: demand.flatMap((line) => {
      const shortfall = round2(line.quantity - (perLine.get(line.orderLineId) ?? 0));

      if (shortfall <= 0) return [];

      const home =
        warehouseById.get(input.allocations[0]?.warehouseId ?? "") ?? warehouses[0];

      if (!home) return [];

      return [
        {
          orderLineId: line.orderLineId,
          productId: line.productId,
          variantId: line.variantId,
          sku: line.sku,
          productName: line.productName,
          quantity: shortfall,
          warehouseId: home.id,
          warehouseCode: home.code,
          warehouseName: home.name,
        },
      ];
    }),
    warehousesUsed: usedIds.map((id) => {
      const warehouse = warehouseById.get(id)!;
      const entries = input.allocations.filter((entry) => entry.warehouseId === id);

      return {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        shippingCostWeight: Number(warehouse.shippingCostWeight),
        lineCount: new Set(entries.map((entry) => entry.orderLineId)).size,
        unitCount: round2(entries.reduce((total, entry) => total + entry.quantity, 0)),
      };
    }),
    shipmentCount: usedIds.length,
    estimatedShippingCost: round2(
      usedIds.reduce(
        (total, id) =>
          total + baseShipmentCost * Number(warehouseById.get(id)!.shippingCostWeight),
        0,
      ),
    ),
    method,
    fullyBackordered: usedIds.length === 0,
    explanation: `Manual split across ${usedIds.length} warehouse${usedIds.length === 1 ? "" : "s"}, set by ${user.email}.`,
  };

  return commitPlan(user, orderId, plan, input.reason ?? "Manual warehouse override");
}

/**
 * Stock arrived while the order was part-shipped. Re-plans only the open
 * backordered quantities and folds whatever can now be sourced into the
 * existing fulfillment, which is the "Consolidate Remaining Backorder" prompt.
 */
export async function consolidateBackorders(user: AuthUser, orderId: string) {
  const order = await loadOrder(user, orderId);

  const fulfillmentOrder = await prisma.fulfillmentOrder.findFirst({
    where: { orderId, status: { not: FULFILLMENT_STATUS.CANCELLED } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, estimatedShipmentCount: true },
  });

  if (!fulfillmentOrder) {
    throw new ValidationError("This order has not been allocated yet", [
      "fulfillment: allocate the order first",
    ]);
  }

  const open = await prisma.backorder.findMany({
    where: { orderLine: { orderId }, status: BACKORDER_STATUS.OPEN },
    select: {
      id: true,
      orderLineId: true,
      productId: true,
      variantId: true,
      quantity: true,
      product: { select: { sku: true, name: true } },
    },
  });

  if (open.length === 0) {
    throw new ValidationError("There is nothing backordered on this order", [
      "backorders: none open",
    ]);
  }

  const plan = await suggestAllocation(
    open.map((entry) => ({
      orderLineId: entry.orderLineId,
      productId: entry.productId,
      variantId: entry.variantId,
      sku: entry.product.sku,
      productName: entry.product.name,
      quantity: Number(entry.quantity),
    })),
  );

  if (plan.allocations.length === 0) {
    throw new ValidationError("Still no stock available for the backordered lines", [
      "backorders: nothing could be sourced",
    ]);
  }

  const sourcedByLine = new Map<string, number>();

  for (const allocation of plan.allocations) {
    sourcedByLine.set(
      allocation.orderLineId,
      (sourcedByLine.get(allocation.orderLineId) ?? 0) + allocation.quantity,
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const allocation of plan.allocations) {
      await tx.fulfillmentAllocation.create({
        data: {
          fulfillmentOrderId: fulfillmentOrder.id,
          orderLineId: allocation.orderLineId,
          warehouseId: allocation.warehouseId,
          allocatedQuantity: allocation.quantity,
          allocationMethod: ALLOCATION_METHOD.BACKORDER,
        },
      });

      await reserve(tx, allocation.warehouseId, allocation.orderLineId, allocation.quantity);
    }

    // Close or shrink each backorder by what was just sourced for its line.
    for (const entry of open) {
      const sourced = sourcedByLine.get(entry.orderLineId) ?? 0;

      if (sourced <= 0) continue;

      const outstanding = round2(Number(entry.quantity) - sourced);

      await tx.backorder.update({
        where: { id: entry.id },
        data:
          outstanding > 0
            ? { quantity: outstanding }
            : {
                status: BACKORDER_STATUS.RESOLVED,
                quantity: 0,
                consolidatedAt: new Date(),
              },
      });

      sourcedByLine.set(entry.orderLineId, Math.max(0, sourced - Number(entry.quantity)));
    }

    const stillOpen = await tx.backorder.count({
      where: { orderLine: { orderId }, status: BACKORDER_STATUS.OPEN },
    });

    await tx.fulfillmentOrder.update({
      where: { id: fulfillmentOrder.id },
      data: {
        status: stillOpen > 0 ? FULFILLMENT_STATUS.ALLOCATED : FULFILLMENT_STATUS.ALLOCATED,
        estimatedShipmentCount:
          (fulfillmentOrder.estimatedShipmentCount ?? 0) + plan.shipmentCount,
      },
    });
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "FulfillmentOrder",
    entityId: fulfillmentOrder.id,
    newValues: {
      consolidated: plan.allocations.length,
      units: round2(plan.allocations.reduce((total, entry) => total + entry.quantity, 0)),
    },
    reason: "Consolidated remaining backorder after restock",
  });

  return getFulfillment(user, orderId);
}

/**
 * Ships what is allocated: reservations become real stock movements, and the
 * order is only `FULFILLED` when nothing is still on backorder.
 */
export async function ship(user: AuthUser, orderId: string, input: ShipInput) {
  const order = await loadOrder(user, orderId);

  const fulfillmentOrder = await prisma.fulfillmentOrder.findFirst({
    where: { orderId, status: { not: FULFILLMENT_STATUS.CANCELLED } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      allocations: {
        select: {
          id: true,
          orderLineId: true,
          warehouseId: true,
          allocatedQuantity: true,
          fulfilledQuantity: true,
          orderLine: { select: { productId: true, variantId: true } },
        },
      },
    },
  });

  if (!fulfillmentOrder) {
    throw new ValidationError("This order has not been allocated yet", [
      "fulfillment: allocate the order first",
    ]);
  }

  if (fulfillmentOrder.status === FULFILLMENT_STATUS.DELIVERED) {
    throw new ValidationError("This fulfillment has already been delivered", [
      "status: already delivered",
    ]);
  }

  const outstanding = fulfillmentOrder.allocations.filter(
    (allocation) =>
      Number(allocation.allocatedQuantity) > Number(allocation.fulfilledQuantity),
  );

  if (outstanding.length === 0) {
    throw new ValidationError("Everything allocated has already shipped", [
      "allocations: nothing outstanding",
    ]);
  }

  await prisma.$transaction(async (tx) => {
    for (const allocation of outstanding) {
      const quantity =
        Number(allocation.allocatedQuantity) - Number(allocation.fulfilledQuantity);

      await tx.fulfillmentAllocation.update({
        where: { id: allocation.id },
        data: { fulfilledQuantity: allocation.allocatedQuantity },
      });

      // Shipping converts a reservation into an actual stock movement: the
      // units leave on-hand and stop being reserved at the same moment.
      const inventory = await tx.inventory.findFirst({
        where: {
          warehouseId: allocation.warehouseId,
          productId: allocation.orderLine.productId,
          variantId: allocation.orderLine.variantId,
        },
        select: { id: true, onHandQuantity: true, reservedQuantity: true },
      });

      if (inventory) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            onHandQuantity: Math.max(0, Number(inventory.onHandQuantity) - quantity),
            reservedQuantity: Math.max(0, Number(inventory.reservedQuantity) - quantity),
          },
        });
      }
    }

    const stillOpen = await tx.backorder.count({
      where: { orderLine: { orderId }, status: BACKORDER_STATUS.OPEN },
    });

    await tx.fulfillmentOrder.update({
      where: { id: fulfillmentOrder.id },
      data: {
        status: stillOpen > 0 ? FULFILLMENT_STATUS.SHIPPED : FULFILLMENT_STATUS.DELIVERED,
        shippedAt: new Date(),
        ...(input.actualShippingCost !== undefined
          ? { actualShippingCost: input.actualShippingCost }
          : {}),
      },
    });

    // A part-shipped order stays `ALLOCATED`; only a complete one is fulfilled.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: stillOpen > 0 ? ORDER_STATUS.ALLOCATED : ORDER_STATUS.FULFILLED,
      },
    });
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: "FulfillmentOrder",
    entityId: fulfillmentOrder.id,
    oldValues: { status: fulfillmentOrder.status },
    newValues: { shipped: outstanding.length, orderNumber: order.orderNumber },
    reason: input.reason ?? "Shipment dispatched",
  });

  return getFulfillment(user, orderId);
}

/* ── committing a plan ────────────────────────────── */

async function commitPlan(
  user: AuthUser,
  orderId: string,
  plan: AllocationPlan,
  reason: string,
) {
  const restockDays = await getNumericSetting("BACKORDER_RESTOCK_DAYS");
  const expectedRestock = new Date(Date.now() + restockDays * 24 * 60 * 60 * 1000);

  const fulfillmentOrder = await prisma.$transaction(async (tx) => {
    const created = await tx.fulfillmentOrder.create({
      data: {
        orderId,
        status: FULFILLMENT_STATUS.ALLOCATED,
        estimatedShipmentCount: plan.shipmentCount,
        estimatedShippingCost: plan.estimatedShippingCost,
      },
      select: { id: true },
    });

    for (const allocation of plan.allocations) {
      await tx.fulfillmentAllocation.create({
        data: {
          fulfillmentOrderId: created.id,
          orderLineId: allocation.orderLineId,
          warehouseId: allocation.warehouseId,
          allocatedQuantity: allocation.quantity,
          allocationMethod: allocation.allocationMethod,
        },
      });

      await reserve(tx, allocation.warehouseId, allocation.orderLineId, allocation.quantity);
    }

    for (const backorder of plan.backorders) {
      await tx.backorder.create({
        data: {
          orderLineId: backorder.orderLineId,
          warehouseId: backorder.warehouseId,
          productId: backorder.productId,
          variantId: backorder.variantId,
          quantity: backorder.quantity,
          status: BACKORDER_STATUS.OPEN,
          expectedRestockDate: expectedRestock,
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.ALLOCATED },
    });

    return created;
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "FulfillmentOrder",
    entityId: fulfillmentOrder.id,
    newValues: {
      orderId,
      method: plan.method,
      shipmentCount: plan.shipmentCount,
      estimatedShippingCost: plan.estimatedShippingCost,
      allocations: plan.allocations.length,
      backorders: plan.backorders.length,
    },
    reason,
  });

  return getFulfillment(user, orderId);
}

/** Marks stock as promised without moving it — see `ship` for the real movement. */
async function reserve(
  tx: TransactionClient,
  warehouseId: string,
  orderLineId: string,
  quantity: number,
) {
  const line = await tx.orderLine.findUnique({
    where: { id: orderLineId },
    select: { productId: true, variantId: true },
  });

  if (!line) {
    return;
  }

  const inventory = await tx.inventory.findFirst({
    where: { warehouseId, productId: line.productId, variantId: line.variantId },
    select: { id: true, reservedQuantity: true },
  });

  if (inventory) {
    await tx.inventory.update({
      where: { id: inventory.id },
      data: { reservedQuantity: Number(inventory.reservedQuantity) + quantity },
    });
  } else {
    await tx.inventory.create({
      data: {
        warehouseId,
        productId: line.productId,
        variantId: line.variantId,
        onHandQuantity: 0,
        reservedQuantity: quantity,
      },
    });
  }
}

/* ── helpers ──────────────────────────────────────── */

type OrderLineRow = {
  id: string;
  quantity: unknown;
  lineType: string;
  product: { id: string; sku: string; name: string; productType: string };
  variant: { id: string } | null;
  productId: string;
  variantId: string | null;
};

/** Physical goods only — services and subscriptions never touch a warehouse. */
function toDemand(lines: readonly OrderLineRow[]): DemandLine[] {
  return lines
    .filter(
      (line) =>
        line.product.productType === PHYSICAL_PRODUCT_TYPE &&
        line.lineType === LINE_TYPE.ONE_TIME,
    )
    .map((line) => ({
      orderLineId: line.id,
      productId: line.productId,
      variantId: line.variantId,
      sku: line.product.sku,
      productName: line.product.name,
      quantity: Number(line.quantity),
    }));
}

/** Free stock per `warehouseId:productId:variantId`, for override validation. */
async function availableByWarehouse(demand: DemandLine[]) {
  const rows = await prisma.inventory.findMany({
    where: { productId: { in: [...new Set(demand.map((line) => line.productId))] } },
    select: {
      warehouseId: true,
      productId: true,
      variantId: true,
      onHandQuantity: true,
      reservedQuantity: true,
    },
  });

  return new Map(
    rows.map((row) => [
      `${row.warehouseId}:${row.productId}:${row.variantId ?? ""}`,
      Math.max(0, Number(row.onHandQuantity) - Number(row.reservedQuantity)),
    ]),
  );
}

async function findConsolidatable(
  backorders: readonly { id: string; productId: string; quantity: unknown; status: string }[],
) {
  const open = backorders.filter((entry) => entry.status === BACKORDER_STATUS.OPEN);

  if (open.length === 0) {
    return [];
  }

  const rows = await prisma.inventory.findMany({
    where: { productId: { in: open.map((entry) => entry.productId) } },
    select: {
      productId: true,
      onHandQuantity: true,
      reservedQuantity: true,
    },
  });

  const freeByProduct = new Map<string, number>();

  for (const row of rows) {
    const free = Math.max(0, Number(row.onHandQuantity) - Number(row.reservedQuantity));

    freeByProduct.set(row.productId, (freeByProduct.get(row.productId) ?? 0) + free);
  }

  // Only the backorders that stock has actually arrived for.
  return open
    .filter((entry) => (freeByProduct.get(entry.productId) ?? 0) > 0)
    .map((entry) => ({
      backorderId: entry.id,
      productId: entry.productId,
      backorderedQuantity: Number(entry.quantity),
      nowAvailable: round2(freeByProduct.get(entry.productId) ?? 0),
    }));
}

type CommittedRow = {
  estimatedShipmentCount: number | null;
  estimatedShippingCost: unknown;
  actualShippingCost: unknown;
  allocations: readonly {
    warehouseId: string;
    orderLineId: string;
    allocatedQuantity: unknown;
    allocationMethod: string;
    warehouse: { id: string; code: string; name: string; shippingCostWeight: unknown };
  }[];
};

/**
 * Renders an already-committed fulfillment in the same shape the planner
 * produces, so the screen has one plan to display whether or not stock has been
 * reserved yet — and so a committed order never shows a shipment count that
 * disagrees with its own allocations.
 */
async function summariseCommitted(
  fulfillmentOrder: CommittedRow,
  backorders: readonly { quantity: unknown }[],
): Promise<AllocationPlan> {
  const used = new Map<string, { lines: Set<string>; units: number }>();
  const warehouseById = new Map<
    string,
    { id: string; code: string; name: string; shippingCostWeight: number }
  >();

  for (const allocation of fulfillmentOrder.allocations) {
    const entry = used.get(allocation.warehouseId) ?? { lines: new Set<string>(), units: 0 };

    entry.lines.add(allocation.orderLineId);
    entry.units += Number(allocation.allocatedQuantity);
    used.set(allocation.warehouseId, entry);

    warehouseById.set(allocation.warehouseId, {
      id: allocation.warehouse.id,
      code: allocation.warehouse.code,
      name: allocation.warehouse.name,
      shippingCostWeight: Number(allocation.warehouse.shippingCostWeight),
    });
  }

  const warehousesUsed = [...used.entries()].map(([warehouseId, entry]) => {
    const warehouse = warehouseById.get(warehouseId)!;

    return {
      ...warehouse,
      lineCount: entry.lines.size,
      unitCount: round2(entry.units),
    };
  });

  const method =
    warehousesUsed.length === 0
      ? ALLOCATION_METHOD.BACKORDER
      : warehousesUsed.length === 1
        ? ALLOCATION_METHOD.SINGLE_WAREHOUSE
        : ALLOCATION_METHOD.SPLIT;

  const cost = Number(
    fulfillmentOrder.actualShippingCost ?? fulfillmentOrder.estimatedShippingCost ?? 0,
  );

  return {
    allocations: fulfillmentOrder.allocations.map((allocation) => ({
      orderLineId: allocation.orderLineId,
      sku: "",
      productName: "",
      warehouseId: allocation.warehouseId,
      warehouseCode: allocation.warehouse.code,
      warehouseName: allocation.warehouse.name,
      quantity: Number(allocation.allocatedQuantity),
      allocationMethod: allocation.allocationMethod,
    })),
    backorders: [],
    warehousesUsed,
    shipmentCount: fulfillmentOrder.estimatedShipmentCount ?? warehousesUsed.length,
    estimatedShippingCost: round2(cost),
    method,
    fullyBackordered: warehousesUsed.length === 0 && backorders.length > 0,
    explanation: describeCommitted(warehousesUsed, backorders, cost),
  };
}

function describeCommitted(
  warehousesUsed: AllocationPlan["warehousesUsed"],
  backorders: readonly { quantity: unknown }[],
  cost: number,
): string {
  const parts: string[] = [];

  if (warehousesUsed.length === 0) {
    parts.push("Nothing could be sourced, so the whole order is on backorder");
  } else if (warehousesUsed.length === 1) {
    parts.push(`Reserved at ${warehousesUsed[0]!.name}, shipping as one consignment`);
  } else {
    parts.push(
      `Reserved across ${warehousesUsed.length} warehouses (${warehousesUsed
        .map((warehouse) => warehouse.name)
        .join(" and ")})`,
    );
  }

  if (cost > 0) {
    parts.push(`shipping ${cost.toFixed(2)}`);
  }

  if (backorders.length > 0) {
    const units = backorders.reduce((total, entry) => total + Number(entry.quantity), 0);

    parts.push(
      `${round2(units)} unit${units === 1 ? "" : "s"} still awaiting stock`,
    );
  }

  return `${parts.join("; ")}.`;
}

function assertAllocatable(status: string) {
  if (status === ORDER_STATUS.CANCELLED) {
    throw new ValidationError("A cancelled order cannot be fulfilled", [
      "status: order is cancelled",
    ]);
  }

  if (status === ORDER_STATUS.FULFILLED) {
    throw new ValidationError("This order has already been fulfilled", [
      "status: order is fulfilled",
    ]);
  }
}

async function assertNoOpenFulfillment(orderId: string) {
  const existing = await prisma.fulfillmentOrder.findFirst({
    where: { orderId, status: { not: FULFILLMENT_STATUS.CANCELLED } },
    select: { id: true },
  });

  if (existing) {
    throw new ValidationError("This order is already allocated", [
      "fulfillment: an allocation already exists",
    ]);
  }
}

async function loadOrder(user: AuthUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currencyCode: true,
      salesRepId: true,
      promisedDeliveryDate: true,
      customer: { select: { id: true, name: true, shippingAddress: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          lineType: true,
          product: {
            select: { id: true, sku: true, name: true, productType: true },
          },
          variant: { select: { id: true } },
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && order.salesRepId !== user.sub) {
    throw new ForbiddenError("This order belongs to another sales rep");
  }

  return order;
}
