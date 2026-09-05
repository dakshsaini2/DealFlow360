import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { AUDIT_ACTION } from "../../common/constants/status.js";
import type { AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import {
  SETTING_DEFAULTS,
  getAllSettings,
  setSetting,
  type SettingKey,
} from "../../common/utils/settings.js";
import type {
  CreatePlanInput,
  CreateTierInput,
  CreateWarehouseInput,
  PlanProductsInput,
  SetStockInput,
  UpdatePlanInput,
  UpdateSettingsInput,
  UpdateTierInput,
  UpdateWarehouseInput,
  UpsertDiscountRuleInput,
} from "./admin.types.js";

/**
 * Backend configuration (spec section A).
 *
 * These are the knobs the rest of the platform reads at runtime: warehouses and
 * stock feed the split engine, plans decide how a recurring line bills, and the
 * tier/category ceilings are what every quote line is checked against. Changing
 * one here changes behaviour everywhere, which is why every write is audited.
 */

/* ── warehouses & stock (A4) ──────────────────────── */

export async function listWarehouses() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      shippingCostWeight: true,
      isActive: true,
      _count: { select: { inventory: true } },
    },
  });

  return { data: serialize(warehouses) };
}

export async function createWarehouse(user: AuthUser, input: CreateWarehouseInput) {
  const existing = await prisma.warehouse.findUnique({
    where: { code: input.code },
    select: { id: true },
  });

  if (existing) {
    throw new ValidationError("A warehouse with that code already exists", [
      "code: must be unique",
    ]);
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      code: input.code,
      name: input.name,
      address: input.address ?? null,
      shippingCostWeight: input.shippingCostWeight,
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "Warehouse",
    entityId: warehouse.id,
    newValues: input,
  });

  return { warehouse: serialize(warehouse) };
}

export async function updateWarehouse(
  user: AuthUser,
  id: string,
  input: UpdateWarehouseInput,
) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError("Warehouse not found");
  }

  const warehouse = await prisma.warehouse.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.shippingCostWeight !== undefined
        ? { shippingCostWeight: input.shippingCostWeight }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "Warehouse",
    entityId: id,
    oldValues: {
      shippingCostWeight: Number(existing.shippingCostWeight),
      isActive: existing.isActive,
    },
    newValues: input,
  });

  return { warehouse: serialize(warehouse) };
}

/**
 * Sets on-hand stock for one product at one warehouse.
 *
 * Reserved quantity is never written here — it belongs to the fulfillment
 * engine, which owns what has been promised to orders. A restock adds to what
 * is physically there and the free balance follows.
 */
export async function setStock(user: AuthUser, warehouseId: string, input: SetStockInput) {
  const [warehouse, product] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } }),
  ]);

  if (!warehouse) {
    throw new NotFoundError("Warehouse not found");
  }

  if (!product) {
    throw new NotFoundError("Product not found");
  }

  // Postgres treats NULLs as distinct, so the @@unique on the nullable
  // variantId cannot be used as an upsert key — look the row up first.
  const existing = await prisma.inventory.findFirst({
    where: {
      warehouseId,
      productId: input.productId,
      variantId: input.variantId ?? null,
    },
    select: { id: true, onHandQuantity: true, reservedQuantity: true },
  });

  const row = existing
    ? await prisma.inventory.update({
        where: { id: existing.id },
        data: {
          onHandQuantity: input.onHandQuantity,
          ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
          ...(input.reorderQuantity !== undefined
            ? { reorderQuantity: input.reorderQuantity }
            : {}),
        },
      })
    : await prisma.inventory.create({
        data: {
          warehouseId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          onHandQuantity: input.onHandQuantity,
          reorderLevel: input.reorderLevel ?? 0,
          reorderQuantity: input.reorderQuantity ?? 0,
        },
      });

  await recordAudit({
    actorUserId: user.sub,
    action: existing ? AUDIT_ACTION.UPDATE : AUDIT_ACTION.CREATE,
    entityType: "Inventory",
    entityId: row.id,
    oldValues: existing ? { onHandQuantity: Number(existing.onHandQuantity) } : undefined,
    newValues: { onHandQuantity: input.onHandQuantity },
    reason: "Stock level set from the backend",
  });

  return {
    stock: {
      ...serialize(row),
      available: round2(
        Math.max(0, Number(row.onHandQuantity) - Number(row.reservedQuantity)),
      ),
    },
  };
}

/* ── subscription plans (A5) ──────────────────────── */

export async function listPlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      billingInterval: true,
      intervalCount: true,
      price: true,
      currencyCode: true,
      prorationEnabled: true,
      cancellationPolicy: true,
      refundPolicy: true,
      isActive: true,
      products: {
        select: { product: { select: { id: true, sku: true, name: true } } },
      },
      _count: { select: { subscriptions: true } },
    },
  });

  return {
    data: plans.map((plan) => ({
      ...serialize({
        id: plan.id,
        name: plan.name,
        billingInterval: plan.billingInterval,
        intervalCount: plan.intervalCount,
        price: plan.price,
        currencyCode: plan.currencyCode,
        prorationEnabled: plan.prorationEnabled,
        cancellationPolicy: plan.cancellationPolicy,
        refundPolicy: plan.refundPolicy,
        isActive: plan.isActive,
      }),
      products: plan.products.map((entry) => entry.product),
      subscriptionLineCount: plan._count.subscriptions,
    })),
  };
}

export async function createPlan(user: AuthUser, input: CreatePlanInput) {
  const existing = await prisma.subscriptionPlan.findUnique({
    where: { name: input.name },
    select: { id: true },
  });

  if (existing) {
    throw new ValidationError("A plan with that name already exists", [
      "name: must be unique",
    ]);
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: input.name,
      billingInterval: input.billingInterval,
      intervalCount: input.intervalCount,
      price: input.price,
      currencyCode: input.currencyCode,
      prorationEnabled: input.prorationEnabled,
      cancellationPolicy: input.cancellationPolicy ?? null,
      refundPolicy: input.refundPolicy ?? null,
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    newValues: input,
  });

  return { plan: serialize(plan) };
}

export async function updatePlan(user: AuthUser, id: string, input: UpdatePlanInput) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError("Subscription plan not found");
  }

  const plan = await prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.billingInterval !== undefined
        ? { billingInterval: input.billingInterval }
        : {}),
      ...(input.intervalCount !== undefined ? { intervalCount: input.intervalCount } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.prorationEnabled !== undefined
        ? { prorationEnabled: input.prorationEnabled }
        : {}),
      ...(input.cancellationPolicy !== undefined
        ? { cancellationPolicy: input.cancellationPolicy }
        : {}),
      ...(input.refundPolicy !== undefined ? { refundPolicy: input.refundPolicy } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "SubscriptionPlan",
    entityId: id,
    oldValues: {
      billingInterval: existing.billingInterval,
      intervalCount: existing.intervalCount,
      isActive: existing.isActive,
    },
    newValues: input,
  });

  return { plan: serialize(plan) };
}

/** Replaces the set of products that may be sold on a plan. */
export async function setPlanProducts(
  user: AuthUser,
  id: string,
  input: PlanProductsInput,
) {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!plan) {
    throw new NotFoundError("Subscription plan not found");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: input.productIds } },
    select: { id: true },
  });

  if (products.length !== input.productIds.length) {
    throw new ValidationError("One or more products do not exist", [
      "productIds: unknown product",
    ]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.productSubscriptionPlan.deleteMany({ where: { subscriptionPlanId: id } });

    if (input.productIds.length > 0) {
      await tx.productSubscriptionPlan.createMany({
        data: input.productIds.map((productId) => ({
          productId,
          subscriptionPlanId: id,
        })),
      });
    }
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "SubscriptionPlan",
    entityId: id,
    newValues: { productCount: input.productIds.length },
    reason: "Plan product list replaced",
  });

  return listPlans();
}

/* ── discount governance (A3) ─────────────────────── */

/**
 * Tiers with their ceilings and every category rule underneath them — the whole
 * governance picture in one response, because a ceiling only makes sense next
 * to the tier default it overrides.
 */
export async function getDiscountGovernance() {
  const [tiers, categories] = await Promise.all([
    prisma.customerTier.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        defaultDiscountCeiling: true,
        isActive: true,
        _count: { select: { customers: true } },
        discountRules: {
          orderBy: { priority: "desc" },
          select: {
            id: true,
            categoryId: true,
            maxDiscountPercent: true,
            priority: true,
            isActive: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const policies = await prisma.approvalPolicy.findMany({
    orderBy: { riskMin: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      riskMin: true,
      riskMax: true,
      isActive: true,
      steps: {
        orderBy: { stepOrder: "asc" },
        select: { id: true, stepOrder: true, role: true, isRequired: true },
      },
    },
  });

  return {
    tiers: serialize(tiers),
    categories: serialize(categories),
    /** Read-only here: which risk band routes to whom. */
    approvalPolicies: serialize(policies),
  };
}

export async function createTier(user: AuthUser, input: CreateTierInput) {
  const existing = await prisma.customerTier.findUnique({
    where: { name: input.name },
    select: { id: true },
  });

  if (existing) {
    throw new ValidationError("A tier with that name already exists", [
      "name: must be unique",
    ]);
  }

  const tier = await prisma.customerTier.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      defaultDiscountCeiling: input.defaultDiscountCeiling,
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "CustomerTier",
    entityId: tier.id,
    newValues: input,
  });

  return { tier: serialize(tier) };
}

export async function updateTier(user: AuthUser, id: string, input: UpdateTierInput) {
  const existing = await prisma.customerTier.findUnique({ where: { id } });

  if (!existing) {
    throw new NotFoundError("Customer tier not found");
  }

  const tier = await prisma.customerTier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.defaultDiscountCeiling !== undefined
        ? { defaultDiscountCeiling: input.defaultDiscountCeiling }
        : {}),
    },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "CustomerTier",
    entityId: id,
    oldValues: {
      defaultDiscountCeiling: existing.defaultDiscountCeiling
        ? Number(existing.defaultDiscountCeiling)
        : null,
    },
    newValues: input,
    reason: "Discount ceiling changed",
  });

  return { tier: serialize(tier) };
}

/**
 * One ceiling per tier-and-category pair, so setting the same pair twice edits
 * the rule rather than stacking a second one the pricing engine would have to
 * choose between.
 */
export async function upsertDiscountRule(
  user: AuthUser,
  input: UpsertDiscountRuleInput,
) {
  const tier = await prisma.customerTier.findUnique({
    where: { id: input.customerTierId },
    select: { id: true, name: true },
  });

  if (!tier) {
    throw new NotFoundError("Customer tier not found");
  }

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundError("Category not found");
    }
  }

  const existing = await prisma.discountRule.findFirst({
    where: {
      customerTierId: input.customerTierId,
      categoryId: input.categoryId ?? null,
    },
    select: { id: true, maxDiscountPercent: true },
  });

  const rule = existing
    ? await prisma.discountRule.update({
        where: { id: existing.id },
        data: {
          maxDiscountPercent: input.maxDiscountPercent,
          priority: input.priority,
          isActive: input.isActive,
        },
      })
    : await prisma.discountRule.create({
        data: {
          customerTierId: input.customerTierId,
          categoryId: input.categoryId ?? null,
          maxDiscountPercent: input.maxDiscountPercent,
          priority: input.priority,
          isActive: input.isActive,
        },
      });

  await recordAudit({
    actorUserId: user.sub,
    action: existing ? AUDIT_ACTION.UPDATE : AUDIT_ACTION.CREATE,
    entityType: "DiscountRule",
    entityId: rule.id,
    oldValues: existing
      ? { maxDiscountPercent: Number(existing.maxDiscountPercent) }
      : undefined,
    newValues: input,
    reason: `Ceiling for ${tier.name}`,
  });

  return { rule: serialize(rule) };
}

export async function deleteDiscountRule(user: AuthUser, id: string) {
  const deleted = await prisma.discountRule.deleteMany({ where: { id } });

  if (deleted.count === 0) {
    throw new NotFoundError("Discount rule not found");
  }

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.DELETE,
    entityType: "DiscountRule",
    entityId: id,
  });

  return { deleted: true };
}

/* ── thresholds (A7) ──────────────────────────────── */

export async function listSettings() {
  const settings = await getAllSettings();

  return {
    data: settings.map((setting) => ({
      ...setting,
      default: SETTING_DEFAULTS[setting.key],
    })),
  };
}

export async function updateSettings(user: AuthUser, input: UpdateSettingsInput) {
  for (const setting of input.settings) {
    // Every threshold the platform reads is numeric; a non-number would fail
    // silently back to the default at the point of use.
    if (!Number.isFinite(Number(setting.value))) {
      throw new ValidationError("Thresholds must be numbers", [
        `${setting.key}: "${setting.value}" is not a number`,
      ]);
    }
  }

  for (const setting of input.settings) {
    await setSetting(setting.key as SettingKey, setting.value);
  }

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "SystemSetting",
    entityId: input.settings.map((setting) => setting.key).join(","),
    newValues: input.settings,
    reason: "Thresholds changed from the backend",
  });

  return listSettings();
}
