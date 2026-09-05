import {
  APPROVAL_STATUS,
  ORDER_STATUS,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2 } from "../../common/utils/serialize.js";
import type { SalesReportQuery } from "./reports.types.js";

/**
 * Sales reporting (spec A7).
 *
 * The four filters the spec names — period, rep or team, approval status, and
 * product or category — are applied to one query, and every breakdown below is
 * derived from that same filtered set. Computing each panel from its own query
 * would let the totals disagree with the rows that make them up.
 */

/** `today` / `week` / `month` resolve here so the client cannot drift. */
function resolvePeriod(query: SalesReportQuery): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = query.to ? new Date(query.to) : now;

  if (query.period === "custom" && query.from) {
    return { from: new Date(query.from), to, label: "Custom range" };
  }

  const days = query.period === "today" ? 1 : query.period === "week" ? 7 : query.period === "quarter" ? 90 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    from,
    to,
    label:
      query.period === "today"
        ? "Today"
        : query.period === "week"
          ? "Last 7 days"
          : query.period === "quarter"
            ? "Last 90 days"
            : "Last 30 days",
  };
}

export async function salesReport(user: AuthUser, query: SalesReportQuery) {
  const period = resolvePeriod(query);
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  // A rep may only ever report on their own book, whatever they ask for.
  const repFilter = orgWide
    ? query.salesRepId
      ? { salesRepId: query.salesRepId }
      : {}
    : { salesRepId: user.sub };

  const where = {
    createdAt: { gte: period.from, lte: period.to },
    ...repFilter,
    ...(query.teamId ? { teamId: query.teamId } : {}),
    ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    ...(query.status ? { status: query.status } : {}),
    // A product or category filter narrows to quotes that *contain* a matching
    // line — the quote is still reported at its full value, because that is
    // what the deal was worth.
    ...(query.productId || query.categoryId
      ? {
          lines: {
            some: {
              ...(query.productId ? { productId: query.productId } : {}),
              ...(query.categoryId ? { product: { categoryId: query.categoryId } } : {}),
            },
          },
        }
      : {}),
  };

  const quotations = await prisma.quotation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      approvalStatus: true,
      subtotal: true,
      discountTotal: true,
      grandTotal: true,
      blendedRiskScore: true,
      currencyCode: true,
      createdAt: true,
      confirmedAt: true,
      customer: { select: { id: true, name: true } },
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true } },
      lines: {
        select: {
          quantity: true,
          lineTotal: true,
          discountAmount: true,
          marginAmount: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const won = quotations.filter((row) => row.status === QUOTATION_STATUS.CONFIRMED);
  const lost = quotations.filter(
    (row) =>
      row.status === QUOTATION_STATUS.CANCELLED || row.status === QUOTATION_STATUS.EXPIRED,
  );
  const open = quotations.filter(
    (row) =>
      row.status === QUOTATION_STATUS.DRAFT ||
      row.status === QUOTATION_STATUS.SENT ||
      row.status === QUOTATION_STATUS.UNDER_NEGOTIATION,
  );

  const sum = (rows: typeof quotations) =>
    round2(rows.reduce((total, row) => total + Number(row.grandTotal), 0));

  const subtotalAll = quotations.reduce((total, row) => total + Number(row.subtotal), 0);
  const discountAll = quotations.reduce(
    (total, row) => total + Number(row.discountTotal),
    0,
  );

  /* ── breakdowns ── */

  const byRep = new Map<
    string,
    { id: string; name: string; quotes: number; won: number; value: number; wonValue: number }
  >();

  for (const row of quotations) {
    const key = row.salesRep.id;
    const entry =
      byRep.get(key) ??
      {
        id: key,
        name: `${row.salesRep.firstName} ${row.salesRep.lastName}`,
        quotes: 0,
        won: 0,
        value: 0,
        wonValue: 0,
      };

    entry.quotes += 1;
    entry.value += Number(row.grandTotal);

    if (row.status === QUOTATION_STATUS.CONFIRMED) {
      entry.won += 1;
      entry.wonValue += Number(row.grandTotal);
    }

    byRep.set(key, entry);
  }

  const byCategory = new Map<
    string,
    { id: string; name: string; units: number; revenue: number; discount: number }
  >();
  const byProduct = new Map<
    string,
    { id: string; sku: string; name: string; units: number; revenue: number; discount: number }
  >();

  for (const row of quotations) {
    for (const line of row.lines) {
      const category = line.product.category;
      const categoryEntry =
        byCategory.get(category.id) ??
        { id: category.id, name: category.name, units: 0, revenue: 0, discount: 0 };

      categoryEntry.units += Number(line.quantity);
      categoryEntry.revenue += Number(line.lineTotal);
      categoryEntry.discount += Number(line.discountAmount);
      byCategory.set(category.id, categoryEntry);

      const productEntry =
        byProduct.get(line.product.id) ??
        {
          id: line.product.id,
          sku: line.product.sku,
          name: line.product.name,
          units: 0,
          revenue: 0,
          discount: 0,
        };

      productEntry.units += Number(line.quantity);
      productEntry.revenue += Number(line.lineTotal);
      productEntry.discount += Number(line.discountAmount);
      byProduct.set(line.product.id, productEntry);
    }
  }

  const byApproval = Object.values(APPROVAL_STATUS).map((status) => ({
    status,
    count: quotations.filter((row) => row.approvalStatus === status).length,
    value: sum(quotations.filter((row) => row.approvalStatus === status)),
  }));

  // Orders and cash are reported from their own tables, since a quote that was
  // confirmed is not the same thing as an invoice that was paid.
  const [orderAggregate, invoiceRows] = await Promise.all([
    prisma.order.aggregate({
      where: {
        createdAt: { gte: period.from, lte: period.to },
        ...(("salesRepId" in repFilter) ? { salesRepId: repFilter.salesRepId } : {}),
        status: { not: ORDER_STATUS.CANCELLED },
      },
      _count: true,
      _sum: { grandTotal: true },
    }),
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: period.from, lte: period.to },
        ...(("salesRepId" in repFilter)
          ? { order: { salesRepId: repFilter.salesRepId as string } }
          : {}),
      },
      select: { grandTotal: true, amountPaid: true, amountDue: true, status: true },
    }),
  ]);

  return {
    period: {
      label: period.label,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    summary: {
      quotations: quotations.length,
      quotationValue: sum(quotations),
      won: won.length,
      wonValue: sum(won),
      lost: lost.length,
      open: open.length,
      openValue: sum(open),
      // Win rate on decided deals only — counting deals still in flight as
      // losses would make every healthy pipeline look terrible.
      winRatePercent:
        won.length + lost.length > 0
          ? round2((won.length / (won.length + lost.length)) * 100)
          : null,
      averageDealSize: quotations.length > 0 ? round2(sum(quotations) / quotations.length) : 0,
      averageDiscountPercent:
        subtotalAll > 0 ? round2((discountAll / subtotalAll) * 100) : 0,
      orders: orderAggregate._count,
      orderValue: round2(Number(orderAggregate._sum.grandTotal ?? 0)),
      invoiced: round2(
        invoiceRows.reduce((total, row) => total + Number(row.grandTotal), 0),
      ),
      collected: round2(
        invoiceRows.reduce((total, row) => total + Number(row.amountPaid), 0),
      ),
      outstanding: round2(
        invoiceRows.reduce((total, row) => total + Number(row.amountDue), 0),
      ),
    },
    byRep: [...byRep.values()]
      .map((entry) => ({
        ...entry,
        value: round2(entry.value),
        wonValue: round2(entry.wonValue),
      }))
      .sort((a, b) => b.value - a.value),
    byCategory: [...byCategory.values()]
      .map((entry) => ({
        ...entry,
        units: round2(entry.units),
        revenue: round2(entry.revenue),
        discount: round2(entry.discount),
      }))
      .sort((a, b) => b.revenue - a.revenue),
    /** Best-selling and most-discounted items, which is what A7 asks for. */
    byProduct: [...byProduct.values()]
      .map((entry) => ({
        ...entry,
        units: round2(entry.units),
        revenue: round2(entry.revenue),
        discount: round2(entry.discount),
        discountPercent:
          entry.revenue + entry.discount > 0
            ? round2((entry.discount / (entry.revenue + entry.discount)) * 100)
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25),
    byApproval,
    rows: quotations.slice(0, 200).map((row) => ({
      id: row.id,
      quoteNumber: row.quoteNumber,
      customer: row.customer.name,
      salesRep: `${row.salesRep.firstName} ${row.salesRep.lastName}`,
      team: row.team?.name ?? null,
      status: row.status,
      approvalStatus: row.approvalStatus,
      riskScore: row.blendedRiskScore === null ? null : Number(row.blendedRiskScore),
      subtotal: round2(Number(row.subtotal)),
      discountTotal: round2(Number(row.discountTotal)),
      grandTotal: round2(Number(row.grandTotal)),
      currencyCode: row.currencyCode,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * The same report as CSV, which is what "export to XLS" means in practice —
 * every spreadsheet opens it, and it needs no dependency.
 */
export function toCsv(report: Awaited<ReturnType<typeof salesReport>>): string {
  const header = [
    "Quote",
    "Customer",
    "Sales rep",
    "Team",
    "Status",
    "Approval",
    "Risk score",
    "Subtotal",
    "Discount",
    "Total",
    "Currency",
    "Created",
    "Confirmed",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const row of report.rows) {
    lines.push(
      [
        row.quoteNumber,
        row.customer,
        row.salesRep,
        row.team ?? "",
        row.status,
        row.approvalStatus,
        row.riskScore ?? "",
        row.subtotal,
        row.discountTotal,
        row.grandTotal,
        row.currencyCode,
        row.createdAt.slice(0, 10),
        row.confirmedAt?.slice(0, 10) ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\r\n");
}

/**
 * Quotes a cell when it contains a comma, quote or newline, doubling any inner
 * quotes — and prefixes anything a spreadsheet would read as a formula, so a
 * customer named `=cmd` cannot become one.
 */
function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
