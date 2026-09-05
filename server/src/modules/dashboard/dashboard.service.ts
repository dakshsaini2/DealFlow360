import { QUOTATION_STATUS } from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";

/**
 * Managers and admins see the whole book; a rep sees only the quotations they
 * own. Every count below is filtered through this one predicate so the two
 * views can never drift apart.
 */
function quotationScope(user: AuthUser) {
  return hasAnyRole(user, ["ADMIN", "SALES_MANAGER"])
    ? {}
    : { salesRepId: user.sub };
}

export async function getSummary(user: AuthUser) {
  const scope = quotationScope(user);
  const orderScope = "salesRepId" in scope ? { salesRepId: user.sub } : {};

  const [
    customerCount,
    quotationCount,
    openQuotations,
    pendingApprovals,
    orderCount,
    pipeline,
    wonRevenue,
  ] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.quotation.count({ where: scope }),
    prisma.quotation.count({
      where: {
        ...scope,
        status: {
          in: [
            QUOTATION_STATUS.DRAFT,
            QUOTATION_STATUS.SENT,
            QUOTATION_STATUS.UNDER_NEGOTIATION,
          ],
        },
      },
    }),
    prisma.quotation.count({
      where: { ...scope, approvalStatus: "PENDING" },
    }),
    prisma.order.count({ where: orderScope }),
    prisma.quotation.aggregate({
      where: {
        ...scope,
        status: {
          in: [
            QUOTATION_STATUS.DRAFT,
            QUOTATION_STATUS.SENT,
            QUOTATION_STATUS.UNDER_NEGOTIATION,
          ],
        },
      },
      _sum: { grandTotal: true },
    }),
    prisma.order.aggregate({ where: orderScope, _sum: { grandTotal: true } }),
  ]);

  return {
    scope: "salesRepId" in scope ? ("own" as const) : ("team" as const),
    counts: {
      customers: customerCount,
      quotations: quotationCount,
      openQuotations,
      pendingApprovals,
      orders: orderCount,
    },
    totals: {
      pipelineValue: round2(Number(pipeline._sum.grandTotal ?? 0)),
      wonRevenue: round2(Number(wonRevenue._sum.grandTotal ?? 0)),
    },
  };
}

/** The most recently touched quotations, for the dashboard's activity list. */
export async function getRecentQuotations(user: AuthUser, limit = 5) {
  const quotations = await prisma.quotation.findMany({
    where: quotationScope(user),
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      approvalStatus: true,
      grandTotal: true,
      currencyCode: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
    },
  });

  return serialize(quotations);
}
