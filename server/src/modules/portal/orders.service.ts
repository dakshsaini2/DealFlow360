import { NotFoundError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  BACKORDER_STATUS,
  LINE_TYPE,
  ORDER_STATUS,
} from "../../common/constants/status.js";
import type { AuthUser } from "../../common/types/auth.types.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";

/**
 * The customer's own orders.
 *
 * Same rule as everywhere else in the portal: a customer sees what they bought,
 * what it cost them, when it is coming and what they owe — and none of the
 * seller's operational detail. Which warehouse an item ships from, what the
 * shipping split cost, the margin on the line and the risk score behind the
 * discount are all absent from these shapes by construction.
 */

/** The accounts this portal user is attached to. */
async function accessibleCustomerIds(user: AuthUser): Promise<string[]> {
  const links = await prisma.customerUser.findMany({
    where: { userId: user.sub },
    select: { customerId: true },
  });

  return links.map((link) => link.customerId);
}

/**
 * Internal fulfillment states describe warehouse work. A customer wants to know
 * one thing — where is my order — so they are collapsed into that.
 */
function deliveryState(options: {
  orderStatus: string;
  fulfillmentStatus: string | null;
  shippedAt: Date | null;
  openBackorders: number;
}) {
  if (options.orderStatus === ORDER_STATUS.CANCELLED) {
    return { label: "Cancelled", detail: "This order was cancelled." };
  }

  if (options.fulfillmentStatus === "DELIVERED") {
    return { label: "Delivered", detail: "Everything on this order has arrived." };
  }

  if (options.fulfillmentStatus === "SHIPPED") {
    return options.openBackorders > 0
      ? {
          label: "Partially shipped",
          detail: "Most of your order is on its way; the rest follows when stock arrives.",
        }
      : { label: "On its way", detail: "Your order has left our warehouse." };
  }

  if (options.fulfillmentStatus === "ALLOCATED") {
    return options.openBackorders > 0
      ? {
          label: "Partly awaiting stock",
          detail: "We are preparing what we have and sourcing the rest.",
        }
      : { label: "Being prepared", detail: "Your order is being picked and packed." };
  }

  return {
    label: "Confirmed",
    detail: "We have your order and are getting it ready.",
  };
}

const LINE_SELECT = {
  id: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  discountAmount: true,
  taxAmount: true,
  lineTotal: true,
  lineType: true,
  product: {
    select: { id: true, sku: true, name: true, unit: true, category: { select: { name: true } } },
  },
  variant: { select: { sku: true, name: true } },
  subscriptionPlan: {
    select: { id: true, name: true, billingInterval: true, intervalCount: true },
  },
} as const;

export async function listOrders(
  user: AuthUser,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const customerIds = await accessibleCustomerIds(user);

  if (customerIds.length === 0) {
    return paginated([], 0, page);
  }

  const where = { customerId: { in: customerIds } };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currencyCode: true,
        grandTotal: true,
        promisedDeliveryDate: true,
        confirmedAt: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        quotation: { select: { id: true, quoteNumber: true } },
        _count: { select: { lines: true } },
        fulfillmentOrders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, shippedAt: true },
        },
        invoices: { select: { amountDue: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  // Open backorders per order, for the delivery wording.
  const backorderCounts = await prisma.backorder.groupBy({
    by: ["orderLineId"],
    where: {
      status: BACKORDER_STATUS.OPEN,
      orderLine: { orderId: { in: rows.map((row) => row.id) } },
    },
    _count: true,
  });

  const linesWithBackorders = await prisma.orderLine.findMany({
    where: { id: { in: backorderCounts.map((entry) => entry.orderLineId) } },
    select: { id: true, orderId: true },
  });

  const openByOrder = new Map<string, number>();

  for (const line of linesWithBackorders) {
    openByOrder.set(line.orderId, (openByOrder.get(line.orderId) ?? 0) + 1);
  }

  return paginated(
    rows.map((row) => {
      const fulfillment = row.fulfillmentOrders[0];
      const outstanding = row.invoices.reduce(
        (total, invoice) => total + Number(invoice.amountDue),
        0,
      );

      return {
        ...serialize({
          id: row.id,
          orderNumber: row.orderNumber,
          currencyCode: row.currencyCode,
          grandTotal: row.grandTotal,
          promisedDeliveryDate: row.promisedDeliveryDate,
          confirmedAt: row.confirmedAt,
          createdAt: row.createdAt,
          customer: row.customer,
          quotation: row.quotation,
          _count: row._count,
        }),
        delivery: deliveryState({
          orderStatus: row.status,
          fulfillmentStatus: fulfillment?.status ?? null,
          shippedAt: fulfillment?.shippedAt ?? null,
          openBackorders: openByOrder.get(row.id) ?? 0,
        }),
        /** What is still to pay across this order's invoices. */
        amountDue: round2(outstanding),
      };
    }),
    total,
    page,
  );
}

export async function getOrder(user: AuthUser, id: string) {
  const customerIds = await accessibleCustomerIds(user);

  if (customerIds.length === 0) {
    throw new ForbiddenError("This account is not linked to any customer");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currencyCode: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      grandTotal: true,
      promisedDeliveryDate: true,
      confirmedAt: true,
      createdAt: true,
      customerId: true,
      customer: {
        select: { id: true, name: true, shippingAddress: true, billingAddress: true },
      },
      quotation: { select: { id: true, quoteNumber: true } },
      salesRep: { select: { firstName: true, lastName: true } },
      lines: { orderBy: { createdAt: "asc" }, select: LINE_SELECT },
      fulfillmentOrders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, shippedAt: true, expectedShipDate: true },
      },
      invoices: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceType: true,
          status: true,
          grandTotal: true,
          amountPaid: true,
          amountDue: true,
          issuedAt: true,
          dueAt: true,
        },
      },
      subscriptions: {
        select: {
          id: true,
          status: true,
          nextBillingDate: true,
          lines: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              discountPercent: true,
              status: true,
              product: { select: { sku: true, name: true } },
              subscriptionPlan: {
                select: { name: true, billingInterval: true, intervalCount: true },
              },
            },
          },
        },
      },
    },
  });

  // Deliberately the same error a missing order gives, so the portal cannot be
  // used to discover which order ids exist.
  if (!order || !customerIds.includes(order.customerId)) {
    throw new NotFoundError("Order not found");
  }

  const backorders = await prisma.backorder.findMany({
    where: { orderLine: { orderId: id }, status: BACKORDER_STATUS.OPEN },
    select: {
      quantity: true,
      expectedRestockDate: true,
      product: { select: { sku: true, name: true } },
    },
  });

  const fulfillment = order.fulfillmentOrders[0];
  const { customerId, status, fulfillmentOrders, salesRep, ...visible } = order;

  const oneTime = order.lines.filter((line) => line.lineType === LINE_TYPE.ONE_TIME);
  const recurring = order.lines.filter((line) => line.lineType === LINE_TYPE.RECURRING);

  return {
    order: {
      ...serialize(visible),
      contact: `${salesRep.firstName} ${salesRep.lastName}`,
    },
    delivery: {
      ...deliveryState({
        orderStatus: status,
        fulfillmentStatus: fulfillment?.status ?? null,
        shippedAt: fulfillment?.shippedAt ?? null,
        openBackorders: backorders.length,
      }),
      shippedAt: fulfillment?.shippedAt?.toISOString() ?? null,
      expectedShipDate: fulfillment?.expectedShipDate?.toISOString() ?? null,
      /**
       * Which items are waiting on stock, and when they are expected. The
       * warehouse they are waiting at is the seller's business, not theirs.
       */
      awaitingStock: backorders.map((entry) => ({
        sku: entry.product.sku,
        name: entry.product.name,
        quantity: Number(entry.quantity),
        expectedRestockDate: entry.expectedRestockDate?.toISOString() ?? null,
      })),
    },
    billing: {
      oneTimeLines: oneTime.length,
      recurringLines: recurring.length,
      oneTimeTotal: round2(
        oneTime.reduce((total, line) => total + Number(line.lineTotal), 0),
      ),
      recurringTotal: round2(
        recurring.reduce((total, line) => total + Number(line.lineTotal), 0),
      ),
      totalDue: round2(
        order.invoices.reduce((total, invoice) => total + Number(invoice.amountDue), 0),
      ),
    },
  };
}
