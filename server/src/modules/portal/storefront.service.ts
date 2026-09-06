import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  APPROVAL_STATUS,
  AUDIT_ACTION,
  QUOTATION_STATUS,
} from "../../common/constants/status.js";
import type { AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import { resolvePricing } from "../catalog/pricing.service.js";
import { recalculate } from "../quotations/quotations.service.js";
import type { BrowseQuery, SubmitRequestInput } from "./portal.types.js";

/**
 * The customer's storefront.
 *
 * Two rules shape everything here.
 *
 * First, a customer sees *their* price — the one their tier's price list gives
 * them — and nothing about how it was arrived at. Cost, margin, and the
 * discount ceiling their rep is working against are all computed by the same
 * pricing engine the internal screens use, and all discarded before the
 * response is built.
 *
 * Second, submitting a request does not create a priced, sent quotation. It
 * creates a *draft* addressed to the rep who owns the account. The rep still
 * decides the discount, and that discount still goes through the blended risk
 * score and the approval chain — so a customer cannot route around governance
 * by asking nicely.
 */

/** The accounts this portal user may act for. */
async function accessibleCustomers(user: AuthUser) {
  const links = await prisma.customerUser.findMany({
    where: { userId: user.sub },
    orderBy: { isPrimary: "desc" },
    select: {
      isPrimary: true,
      customer: {
        select: {
          id: true,
          name: true,
          customerCode: true,
          isActive: true,
          createdByUserId: true,
          customerTier: { select: { id: true, name: true } },
        },
      },
    },
  });

  return links.filter((link) => link.customer.isActive);
}

/** The accounts a portal user can shop for, for the account switcher. */
export async function listAccounts(user: AuthUser) {
  const links = await accessibleCustomers(user);

  return {
    accounts: links.map((link) => ({
      id: link.customer.id,
      name: link.customer.name,
      customerCode: link.customer.customerCode,
      isPrimary: link.isPrimary,
      tier: link.customer.customerTier?.name ?? null,
    })),
  };
}

async function resolveAccount(user: AuthUser, customerId?: string) {
  const links = await accessibleCustomers(user);

  if (links.length === 0) {
    throw new ForbiddenError("This account is not linked to any customer");
  }

  const chosen = customerId
    ? links.find((link) => link.customer.id === customerId)
    : links[0];

  if (!chosen) {
    // Same error an unknown id gives, so the portal cannot be used to probe
    // which customers exist.
    throw new NotFoundError("Account not found");
  }

  return chosen.customer;
}

/**
 * The catalogue, priced for this customer.
 *
 * Prices come from the same `resolvePricing` the quote builder uses, so what a
 * customer is quoted here is exactly what their rep would see — there is no
 * second pricing path that could drift.
 */
export async function browseProducts(
  user: AuthUser,
  query: BrowseQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const customer = await resolveAccount(user, query.customerId);

  const where = {
    isActive: true,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { sku: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        unit: true,
        productType: true,
        category: { select: { id: true, name: true } },
        productSubscriptionPlans: {
          select: {
            subscriptionPlan: {
              select: {
                id: true,
                name: true,
                billingInterval: true,
                intervalCount: true,
                isActive: true,
              },
            },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  if (rows.length === 0) {
    return paginated([], total, page);
  }

  const pricing = await resolvePricing({
    customerId: customer.id,
    currencyCode: "USD",
    lines: rows.map((row) => ({ productId: row.id, quantity: 1, discountPercent: 0 })),
  });

  const priceByProduct = new Map(
    pricing.lines.map((line) => [line.productId, line]),
  );

  return paginated(
    rows.map((row) => {
      const priced = priceByProduct.get(row.id);

      return {
        ...serialize({
          id: row.id,
          sku: row.sku,
          name: row.name,
          description: row.description,
          unit: row.unit,
          category: row.category,
        }),
        // Their price, and the list price only when it is genuinely better —
        // showing "was/now" when the two are equal is just noise.
        unitPrice: priced ? round2(priced.unitPrice) : null,
        listPrice:
          priced && priced.listPrice > priced.unitPrice ? round2(priced.listPrice) : null,
        taxPercent: priced ? priced.taxPercent : null,
        /**
         * Recurring plans this product can be bought on. Everything the
         * pricing engine knows about cost, margin and discount ceilings is
         * deliberately absent from this response.
         */
        subscriptionPlans: row.productSubscriptionPlans
          .map((entry) => entry.subscriptionPlan)
          .filter((plan) => plan.isActive)
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            billingInterval: plan.billingInterval,
            intervalCount: plan.intervalCount,
          })),
      };
    }),
    total,
    page,
  );
}

/** Categories, for the storefront's filter. */
export async function listCategories() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { products: true } } },
  });

  return { data: serialize(categories) };
}

/**
 * Turns a customer's basket into a draft quotation for their rep.
 *
 * The draft is priced through the ordinary engine and left unsent: the rep
 * reviews it, sets any discount, and sends it — at which point the blended risk
 * score and approval routing apply exactly as they would to a quote the rep
 * typed themselves.
 */
export async function submitRequest(user: AuthUser, input: SubmitRequestInput) {
  const customer = await resolveAccount(user, input.customerId);

  const products = await prisma.product.findMany({
    where: { id: { in: input.lines.map((line) => line.productId) }, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      productSubscriptionPlans: { select: { subscriptionPlanId: true } },
    },
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const details: string[] = [];

  for (const line of input.lines) {
    const product = productById.get(line.productId);

    if (!product) {
      details.push(`lines: ${line.productId} is not an available product`);
      continue;
    }

    // A plan the product is not sold on would make a nonsense subscription.
    if (
      line.subscriptionPlanId &&
      !product.productSubscriptionPlans.some(
        (entry) => entry.subscriptionPlanId === line.subscriptionPlanId,
      )
    ) {
      details.push(`lines: ${product.sku} is not sold on that plan`);
    }
  }

  if (details.length > 0) {
    throw new ValidationError("That request could not be read", details);
  }

  // The rep who owns the relationship picks it up. Falling back to any manager
  // means a request is never orphaned on an account with no owner recorded.
  const salesRepId = customer.createdByUserId ?? (await fallbackOwner());

  if (!salesRepId) {
    throw new ValidationError("No sales representative is available to take this request", [
      "customerId: account has no owner",
    ]);
  }

  const validityDays = await getNumericSetting("QUOTE_VALIDITY_DAYS");

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber: await nextQuoteNumber(),
      customerId: customer.id,
      salesRepId,
      currencyCode: "USD",
      status: QUOTATION_STATUS.DRAFT,
      approvalStatus: APPROVAL_STATUS.NOT_REQUIRED,
      source: "PORTAL",
      validUntil: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
      lines: {
        create: input.lines.map((line) => ({
          productId: line.productId,
          subscriptionPlanId: line.subscriptionPlanId ?? null,
          quantity: line.quantity,
          // Real figures land in the recalculation below.
          unitPrice: 0,
          discountPercent: 0,
        })),
      },
    },
    select: { id: true, quoteNumber: true },
  });

  // The customer's own words go on the thread, so the rep opens the quote and
  // sees why it exists.
  await prisma.lineComment.create({
    data: {
      quotationId: quotation.id,
      userId: user.sub,
      comment:
        input.message?.trim() ||
        `Requested ${input.lines.length} item${input.lines.length === 1 ? "" : "s"} from the portal.`,
    },
  });

  // Reuse the single write path for money so a portal draft is priced by
  // exactly the same rules as any other quotation.
  await recalculate(quotation.id);

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "Quotation",
    entityId: quotation.id,
    newValues: {
      source: "PORTAL",
      customerId: customer.id,
      lines: input.lines.length,
      salesRepId,
    },
    reason: "Customer request from the portal",
  });

  const created = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotation.id },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      grandTotal: true,
      currencyCode: true,
      createdAt: true,
      salesRep: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    request: {
      ...serialize({
        id: created.id,
        quoteNumber: created.quoteNumber,
        status: created.status,
        grandTotal: created.grandTotal,
        currencyCode: created.currencyCode,
        createdAt: created.createdAt,
      }),
      contact: `${created.salesRep.firstName} ${created.salesRep.lastName}`,
    },
  };
}

/* ── helpers ──────────────────────────────────────── */

async function fallbackOwner(): Promise<string | null> {
  const manager = await prisma.user.findFirst({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: { in: ["SALES_MANAGER", "ADMIN"] } } } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return manager?.id ?? null;
}

/** Mirrors the numbering used by rep-created quotations. */
async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;

  const latest = await prisma.quotation.findFirst({
    where: { quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: "desc" },
    select: { quoteNumber: true },
  });

  const current = Number(latest?.quoteNumber.slice(prefix.length) ?? 0);

  return `${prefix}${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, "0")}`;
}
