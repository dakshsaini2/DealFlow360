import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import type { ListWarehousesQuery } from "./fulfillment.types.js";

/**
 * The stock picture the fulfillment screen reasons about. `available` is what
 * the split engine may promise — on hand less what is already reserved for
 * other orders — so the number here and the number the engine uses are the
 * same one.
 */
export async function listWarehouses(query: ListWarehousesQuery) {
  // Scoping to an order keeps the response to the SKUs actually being sourced
  // rather than the whole catalogue.
  const productIds = query.orderId
    ? (
        await prisma.orderLine.findMany({
          where: { orderId: query.orderId },
          select: { productId: true },
        })
      ).map((line) => line.productId)
    : undefined;

  const warehouses = await prisma.warehouse.findMany({
    where: {
      isActive: true,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { code: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { shippingCostWeight: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      shippingCostWeight: true,
      inventory: {
        where: productIds ? { productId: { in: productIds } } : undefined,
        orderBy: { product: { sku: "asc" } },
        select: {
          id: true,
          onHandQuantity: true,
          reservedQuantity: true,
          reorderLevel: true,
          product: { select: { id: true, sku: true, name: true, unit: true } },
          variant: { select: { id: true, sku: true, name: true } },
        },
      },
    },
  });

  return {
    data: warehouses.map((warehouse) => ({
      ...serialize({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        address: warehouse.address,
        shippingCostWeight: warehouse.shippingCostWeight,
      }),
      stock: warehouse.inventory.map((row) => {
        const onHand = Number(row.onHandQuantity);
        const reserved = Number(row.reservedQuantity);

        return {
          ...serialize({
            id: row.id,
            product: row.product,
            variant: row.variant,
            reorderLevel: row.reorderLevel,
          }),
          onHandQuantity: round2(onHand),
          reservedQuantity: round2(reserved),
          available: round2(Math.max(0, onHand - reserved)),
          belowReorderLevel: onHand - reserved < Number(row.reorderLevel),
        };
      }),
    })),
  };
}
