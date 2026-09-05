import { ForbiddenError } from "../../common/errors/AuthError.js";
import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { QUOTATION_STATUS } from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { prisma } from "../../common/utils/prisma.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./customers.types.js";

/** The tier a rep's new accounts start on when they may not choose one. */
const DEFAULT_TIER_NAME = "Standard";

const CODE_PREFIX = "CUST-";
const CODE_DIGITS = 3;
const CODE_RETRIES = 5;

const LIST_SELECT = {
  id: true,
  name: true,
  customerCode: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  customerTier: { select: { id: true, name: true, defaultDiscountCeiling: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Portal users only ever see the accounts they are attached to. Internal roles
 * share one book of business, which is how the sales team actually works — the
 * per-rep view lives on the dashboard, not here.
 */
function visibilityFilter(user: AuthUser) {
  if (hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE", "SALES_REP"])) {
    return {};
  }

  return { users: { some: { userId: user.sub } } };
}

/** Only managers and admins may set a tier — it decides the discount ceiling. */
function canAssignTier(user: AuthUser) {
  return hasAnyRole(user, ["ADMIN", "SALES_MANAGER"]);
}

export async function listCustomers(
  user: AuthUser,
  query: ListCustomersQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...visibilityFilter(user),
    ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
    ...(query.tierId ? { customerTierId: query.tierId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { customerCode: { contains: query.q, mode: "insensitive" as const } },
            { email: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    query.sort === "name"
      ? { name: "asc" as const }
      : query.sort === "created"
        ? { createdAt: "desc" as const }
        : { updatedAt: "desc" as const };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip: page.skip,
      take: page.take,
      select: LIST_SELECT,
    }),
    prisma.customer.count({ where }),
  ]);

  return paginated(serialize(rows), total, page);
}

export async function getCustomer(user: AuthUser, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, ...visibilityFilter(user) },
    select: {
      ...LIST_SELECT,
      billingAddress: true,
      shippingAddress: true,
    },
  });

  if (!customer) {
    throw new NotFoundError("Customer not found");
  }

  const [quotationStats, wonOrders, recentQuotations, recentOrders] =
    await Promise.all([
      prisma.quotation.groupBy({
        by: ["status"],
        where: { customerId: id },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.order.aggregate({
        where: { customerId: id },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.quotation.findMany({
        where: { customerId: id },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          approvalStatus: true,
          grandTotal: true,
          currencyCode: true,
          updatedAt: true,
        },
      }),
      prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          grandTotal: true,
          currencyCode: true,
          createdAt: true,
        },
      }),
    ]);

  const openStatuses: string[] = [
    QUOTATION_STATUS.DRAFT,
    QUOTATION_STATUS.SENT,
    QUOTATION_STATUS.UNDER_NEGOTIATION,
  ];

  const quotationCount = quotationStats.reduce(
    (total, group) => total + group._count._all,
    0,
  );

  const openValue = quotationStats
    .filter((group) => openStatuses.includes(group.status))
    .reduce((total, group) => total + Number(group._sum.grandTotal ?? 0), 0);

  return {
    customer: serialize(customer),
    history: {
      quotationCount,
      openQuotationValue: round2(openValue),
      orderCount: wonOrders._count._all,
      orderValue: round2(Number(wonOrders._sum.grandTotal ?? 0)),
      quotationsByStatus: Object.fromEntries(
        quotationStats.map((group) => [group.status, group._count._all]),
      ),
      recentQuotations: serialize(recentQuotations),
      recentOrders: serialize(recentOrders),
    },
  };
}

export async function createCustomer(user: AuthUser, input: CreateCustomerInput) {
  const customerTierId = await resolveTierId(user, input.customerTierId);

  // The generated code can collide with a concurrent insert; the unique index
  // is the real guard, so retry with the next number rather than locking.
  for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
    const customerCode = input.customerCode ?? (await nextCustomerCode(attempt));

    try {
      const customer = await prisma.customer.create({
        data: {
          name: input.name,
          customerCode,
          email: input.email ?? null,
          phone: input.phone ?? null,
          billingAddress: input.billingAddress ?? null,
          shippingAddress: input.shippingAddress ?? null,
          customerTierId,
          createdByUserId: user.sub,
        },
        select: LIST_SELECT,
      });

      return serialize(customer);
    } catch (err) {
      if (!isUniqueCodeViolation(err) || input.customerCode) {
        throw isUniqueCodeViolation(err)
          ? new ValidationError("Customer code already in use", [
              "customerCode: already in use",
            ])
          : err;
      }
    }
  }

  throw new ValidationError("Could not allocate a customer code — try again");
}

export async function updateCustomer(
  user: AuthUser,
  id: string,
  input: UpdateCustomerInput,
) {
  const existing = await prisma.customer.findFirst({
    where: { id, ...visibilityFilter(user) },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Customer not found");
  }

  if (input.customerTierId !== undefined && !canAssignTier(user)) {
    throw new ForbiddenError("Only a manager or admin can change a customer tier");
  }

  if (input.isActive !== undefined && !canAssignTier(user)) {
    throw new ForbiddenError(
      "Only a manager or admin can archive or restore a customer",
    );
  }

  if (input.customerTierId !== undefined) {
    await assertTierExists(input.customerTierId);
  }

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.customerCode !== undefined
          ? { customerCode: input.customerCode }
          : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.billingAddress !== undefined
          ? { billingAddress: input.billingAddress ?? null }
          : {}),
        ...(input.shippingAddress !== undefined
          ? { shippingAddress: input.shippingAddress ?? null }
          : {}),
        ...(input.customerTierId !== undefined
          ? { customerTierId: input.customerTierId }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: LIST_SELECT,
    });

    return serialize(customer);
  } catch (err) {
    if (isUniqueCodeViolation(err)) {
      throw new ValidationError("Customer code already in use", [
        "customerCode: already in use",
      ]);
    }

    throw err;
  }
}

export async function listTiers() {
  const tiers = await prisma.customerTier.findMany({
    where: { isActive: true },
    orderBy: { defaultDiscountCeiling: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      defaultDiscountCeiling: true,
    },
  });

  return serialize(tiers);
}

/* ── helpers ──────────────────────────────────────── */

async function resolveTierId(user: AuthUser, requested: string | undefined) {
  if (requested !== undefined) {
    if (!canAssignTier(user)) {
      throw new ForbiddenError(
        "Only a manager or admin can set a customer tier",
      );
    }

    await assertTierExists(requested);

    return requested;
  }

  const fallback = await prisma.customerTier.findUnique({
    where: { name: DEFAULT_TIER_NAME },
    select: { id: true },
  });

  return fallback?.id ?? null;
}

async function assertTierExists(id: string) {
  const tier = await prisma.customerTier.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!tier) {
    throw new ValidationError("Unknown customer tier", [
      "customerTierId: no such tier",
    ]);
  }
}

/**
 * Next code after the highest existing `CUST-###`. `offset` lets a retry skip
 * past a number that another request just took.
 */
async function nextCustomerCode(offset: number): Promise<string> {
  const latest = await prisma.customer.findFirst({
    where: { customerCode: { startsWith: CODE_PREFIX } },
    orderBy: { customerCode: "desc" },
    select: { customerCode: true },
  });

  const current = Number(latest?.customerCode.slice(CODE_PREFIX.length) ?? 0);
  const next = (Number.isFinite(current) ? current : 0) + 1 + offset;

  return `${CODE_PREFIX}${String(next).padStart(CODE_DIGITS, "0")}`;
}

function isUniqueCodeViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}
