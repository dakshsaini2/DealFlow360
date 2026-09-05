/**
 * Seeds a complete demo dataset: roles, users, tiers, catalog, price lists,
 * discount rules, approval policies, warehouses and stock.
 *
 * Safe to re-run — every write is an upsert keyed on a natural unique column,
 * so seeding twice leaves the same rows rather than duplicating them.
 *
 *   npm run seed
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { USER_ROLES } from "../src/common/types/auth.types.js";
import { RELATIONSHIP_TYPE } from "../src/common/constants/status.js";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";
const CURRENCY = "USD";

async function main() {
  console.log("Seeding DealFlow360…");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  /* ── Roles ──────────────────────────────────────── */

  for (const name of USER_ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` },
    });
  }

  /* ── Users ──────────────────────────────────────── */

  const users = [
    { email: "admin@dealflow360.com", firstName: "Ada", lastName: "Admin", roles: ["ADMIN", "SALES_MANAGER"] },
    { email: "manager@dealflow360.com", firstName: "Maya", lastName: "Manager", roles: ["SALES_MANAGER", "SALES_REP"] },
    { email: "finance@dealflow360.com", firstName: "Fern", lastName: "Diaz", roles: ["FINANCE"] },
    { email: "rep@dealflow360.com", firstName: "Riley", lastName: "Reyes", roles: ["SALES_REP"] },
    { email: "rep2@dealflow360.com", firstName: "Sam", lastName: "Okafor", roles: ["SALES_REP"] },
    { email: "customer@dealflow360.com", firstName: "Chris", lastName: "Chen", roles: ["CUSTOMER"] },
  ] as const;

  const userByEmail = new Map<string, string>();

  for (const spec of users) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { firstName: spec.firstName, lastName: spec.lastName },
      create: {
        email: spec.email,
        passwordHash,
        firstName: spec.firstName,
        lastName: spec.lastName,
      },
    });

    for (const roleName of spec.roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    userByEmail.set(spec.email, user.id);
  }

  const managerId = userByEmail.get("manager@dealflow360.com")!;
  const repId = userByEmail.get("rep@dealflow360.com")!;
  const rep2Id = userByEmail.get("rep2@dealflow360.com")!;

  /* ── Team ───────────────────────────────────────── */

  const team = await prisma.team.upsert({
    where: { name: "North America Sales" },
    update: { managerUserId: managerId },
    create: { name: "North America Sales", managerUserId: managerId },
  });

  for (const userId of [managerId, repId, rep2Id]) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      update: {},
      create: { teamId: team.id, userId },
    });
  }

  /* ── Customer tiers ─────────────────────────────── */

  const tierSpecs = [
    { name: "Standard", ceiling: 10, description: "Entry-level accounts" },
    { name: "Premium", ceiling: 20, description: "Established accounts with recurring volume" },
    { name: "Enterprise", ceiling: 35, description: "Strategic accounts with negotiated terms" },
  ];

  const tierByName = new Map<string, string>();

  for (const spec of tierSpecs) {
    const tier = await prisma.customerTier.upsert({
      where: { name: spec.name },
      update: { defaultDiscountCeiling: spec.ceiling, description: spec.description },
      create: {
        name: spec.name,
        description: spec.description,
        defaultDiscountCeiling: spec.ceiling,
      },
    });

    tierByName.set(spec.name, tier.id);
  }

  /* ── Categories ─────────────────────────────────── */

  const categorySpecs = [
    "Hardware",
    "Software Licenses",
    "Networking",
    "Peripherals",
    "Support Services",
    "Cloud Services",
  ];

  const categoryByName = new Map<string, string>();

  for (const name of categorySpecs) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} product line` },
    });

    categoryByName.set(name, category.id);
  }

  /* ── Products ───────────────────────────────────── */

  type ProductSpec = {
    sku: string;
    name: string;
    category: string;
    basePrice: number;
    costPrice: number;
    unit: string;
    productType: string;
  };

  const products: ProductSpec[] = [
    // Hardware
    { sku: "HW-SRV-1U", name: "Rack Server 1U (16-core)", category: "Hardware", basePrice: 4200, costPrice: 3100, unit: "unit", productType: "GOODS" },
    { sku: "HW-SRV-2U", name: "Rack Server 2U (32-core)", category: "Hardware", basePrice: 7800, costPrice: 5900, unit: "unit", productType: "GOODS" },
    { sku: "HW-WKS-PRO", name: "Workstation Pro Desktop", category: "Hardware", basePrice: 2400, costPrice: 1750, unit: "unit", productType: "GOODS" },
    { sku: "HW-LAP-14", name: 'Business Laptop 14"', category: "Hardware", basePrice: 1450, costPrice: 1080, unit: "unit", productType: "GOODS" },
    { sku: "HW-LAP-16", name: 'Business Laptop 16"', category: "Hardware", basePrice: 1890, costPrice: 1420, unit: "unit", productType: "GOODS" },
    { sku: "HW-NAS-24", name: "NAS Storage Array 24-bay", category: "Hardware", basePrice: 9600, costPrice: 7200, unit: "unit", productType: "GOODS" },
    { sku: "HW-RAM-32", name: "32GB DDR5 Memory Module", category: "Hardware", basePrice: 320, costPrice: 210, unit: "unit", productType: "GOODS" },
    { sku: "HW-SSD-2TB", name: "2TB NVMe Enterprise SSD", category: "Hardware", basePrice: 480, costPrice: 315, unit: "unit", productType: "GOODS" },
    // Software Licenses
    { sku: "SW-OS-SRV", name: "Server OS License (per socket)", category: "Software Licenses", basePrice: 980, costPrice: 520, unit: "license", productType: "SERVICE" },
    { sku: "SW-DB-ENT", name: "Database Enterprise License", category: "Software Licenses", basePrice: 5400, costPrice: 2600, unit: "license", productType: "SERVICE" },
    { sku: "SW-SEC-EP", name: "Endpoint Security Suite", category: "Software Licenses", basePrice: 92, costPrice: 41, unit: "seat", productType: "SERVICE" },
    { sku: "SW-OFF-BIZ", name: "Office Productivity Suite", category: "Software Licenses", basePrice: 148, costPrice: 78, unit: "seat", productType: "SERVICE" },
    { sku: "SW-BI-PRO", name: "Analytics & BI Platform", category: "Software Licenses", basePrice: 2200, costPrice: 990, unit: "license", productType: "SERVICE" },
    { sku: "SW-VIRT-HV", name: "Virtualization Hypervisor License", category: "Software Licenses", basePrice: 1650, costPrice: 800, unit: "license", productType: "SERVICE" },
    // Networking
    { sku: "NW-SW-48P", name: "48-Port Managed Switch", category: "Networking", basePrice: 2850, costPrice: 2050, unit: "unit", productType: "GOODS" },
    { sku: "NW-SW-24P", name: "24-Port Managed Switch", category: "Networking", basePrice: 1620, costPrice: 1150, unit: "unit", productType: "GOODS" },
    { sku: "NW-FW-ENT", name: "Enterprise Firewall Appliance", category: "Networking", basePrice: 6400, costPrice: 4600, unit: "unit", productType: "GOODS" },
    { sku: "NW-AP-WIFI6", name: "WiFi 6 Access Point", category: "Networking", basePrice: 410, costPrice: 275, unit: "unit", productType: "GOODS" },
    { sku: "NW-RTR-EDGE", name: "Edge Router (10GbE)", category: "Networking", basePrice: 3900, costPrice: 2850, unit: "unit", productType: "GOODS" },
    { sku: "NW-CBL-CAT6", name: "Cat6A Patch Cable (3m)", category: "Networking", basePrice: 14, costPrice: 6, unit: "unit", productType: "GOODS" },
    // Peripherals
    { sku: "PR-MON-27", name: '27" 4K Monitor', category: "Peripherals", basePrice: 540, costPrice: 380, unit: "unit", productType: "GOODS" },
    { sku: "PR-MON-34", name: '34" Ultrawide Monitor', category: "Peripherals", basePrice: 890, costPrice: 640, unit: "unit", productType: "GOODS" },
    { sku: "PR-DOCK-TB", name: "Thunderbolt Docking Station", category: "Peripherals", basePrice: 285, costPrice: 190, unit: "unit", productType: "GOODS" },
    { sku: "PR-KB-MECH", name: "Mechanical Keyboard", category: "Peripherals", basePrice: 128, costPrice: 72, unit: "unit", productType: "GOODS" },
    { sku: "PR-HS-ANC", name: "Noise-Cancelling Headset", category: "Peripherals", basePrice: 215, costPrice: 138, unit: "unit", productType: "GOODS" },
    { sku: "PR-WEBCAM-4K", name: "4K Conference Webcam", category: "Peripherals", basePrice: 175, costPrice: 105, unit: "unit", productType: "GOODS" },
    // Support Services
    { sku: "SV-SUP-BASIC", name: "Basic Support (8x5, annual)", category: "Support Services", basePrice: 1200, costPrice: 480, unit: "year", productType: "SERVICE" },
    { sku: "SV-SUP-PREM", name: "Premium Support (24x7, annual)", category: "Support Services", basePrice: 3600, costPrice: 1450, unit: "year", productType: "SERVICE" },
    { sku: "SV-INST-RACK", name: "On-site Rack Installation", category: "Support Services", basePrice: 2200, costPrice: 1300, unit: "engagement", productType: "SERVICE" },
    { sku: "SV-TRAIN-ADM", name: "Administrator Training (5 days)", category: "Support Services", basePrice: 4800, costPrice: 2200, unit: "engagement", productType: "SERVICE" },
    { sku: "SV-MIG-DATA", name: "Data Migration Service", category: "Support Services", basePrice: 8500, costPrice: 4900, unit: "engagement", productType: "SERVICE" },
    { sku: "SV-HEALTH-CHK", name: "Annual Infrastructure Health Check", category: "Support Services", basePrice: 1900, costPrice: 850, unit: "engagement", productType: "SERVICE" },
    // Cloud Services
    { sku: "CL-COMP-STD", name: "Cloud Compute Standard (per vCPU/mo)", category: "Cloud Services", basePrice: 38, costPrice: 19, unit: "month", productType: "SERVICE" },
    { sku: "CL-STOR-TB", name: "Cloud Object Storage (per TB/mo)", category: "Cloud Services", basePrice: 23, costPrice: 11, unit: "month", productType: "SERVICE" },
    { sku: "CL-BKP-ENT", name: "Managed Backup (per TB/mo)", category: "Cloud Services", basePrice: 46, costPrice: 22, unit: "month", productType: "SERVICE" },
    { sku: "CL-DR-SITE", name: "Disaster Recovery Site (monthly)", category: "Cloud Services", basePrice: 2400, costPrice: 1350, unit: "month", productType: "SERVICE" },
    { sku: "CL-CDN-TB", name: "CDN Bandwidth (per TB)", category: "Cloud Services", basePrice: 68, costPrice: 30, unit: "TB", productType: "SERVICE" },
    { sku: "CL-K8S-MGD", name: "Managed Kubernetes Cluster (monthly)", category: "Cloud Services", basePrice: 780, costPrice: 390, unit: "month", productType: "SERVICE" },
  ];

  const productBySku = new Map<string, string>();

  for (const spec of products) {
    const product = await prisma.product.upsert({
      where: { sku: spec.sku },
      update: {
        name: spec.name,
        basePrice: spec.basePrice,
        costPrice: spec.costPrice,
      },
      create: {
        sku: spec.sku,
        name: spec.name,
        categoryId: categoryByName.get(spec.category)!,
        description: `${spec.name} — ${spec.category}`,
        productType: spec.productType,
        basePrice: spec.basePrice,
        costPrice: spec.costPrice,
        unit: spec.unit,
        taxRate: 8.5,
      },
    });

    productBySku.set(spec.sku, product.id);
  }

  /* ── Price lists (one per tier) ─────────────────── */

  // Premium and Enterprise buy off a pre-discounted list; Standard pays base.
  const priceListSpecs = [
    { name: "Standard List (USD)", tier: "Standard", multiplier: 1 },
    { name: "Premium List (USD)", tier: "Premium", multiplier: 0.94 },
    { name: "Enterprise List (USD)", tier: "Enterprise", multiplier: 0.88 },
  ];

  for (const spec of priceListSpecs) {
    const existing = await prisma.priceList.findFirst({ where: { name: spec.name } });

    const priceList =
      existing ??
      (await prisma.priceList.create({
        data: {
          name: spec.name,
          customerTierId: tierByName.get(spec.tier)!,
          currencyCode: CURRENCY,
          validFrom: new Date("2026-01-01"),
        },
      }));

    for (const product of products) {
      const productId = productBySku.get(product.sku)!;
      const unitPrice = Math.round(product.basePrice * spec.multiplier * 100) / 100;

      const item = await prisma.priceListItem.findFirst({
        where: { priceListId: priceList.id, productId, variantId: null },
      });

      if (item) {
        await prisma.priceListItem.update({
          where: { id: item.id },
          data: { unitPrice },
        });
      } else {
        await prisma.priceListItem.create({
          data: { priceListId: priceList.id, productId, unitPrice },
        });
      }
    }
  }

  /* ── Discount rules (tier x category ceilings) ──── */

  // Ceilings are derived from real margins rather than picked by feel: for each
  // category we take its WORST-margin product and allow the largest discount
  // that still leaves ~8% margin after the tier's price list has been applied.
  // Using the worst case, not the average, is what makes the ceiling a real
  // guarantee — no product in the category can be sold below the floor while
  // staying inside its limit. Hardware is tightest because it is thinnest.
  const categoryCeilings: Record<string, Record<string, number>> = {
    Standard: {
      Hardware: 17, Networking: 20, Peripherals: 21,
      "Cloud Services": 38, "Software Licenses": 42, "Support Services": 35,
    },
    Premium: {
      Hardware: 12, Networking: 15, Peripherals: 16,
      "Cloud Services": 34, "Software Licenses": 38, "Support Services": 31,
    },
    Enterprise: {
      Hardware: 6, Networking: 9, Peripherals: 11,
      "Cloud Services": 30, "Software Licenses": 34, "Support Services": 27,
    },
  };

  const discountRules: { tier: string; category: string | null; max: number; priority: number }[] = [];

  for (const [tier, byCategory] of Object.entries(categoryCeilings)) {
    // Tier-wide fallback for any category without its own rule.
    discountRules.push({
      tier,
      category: null,
      max: Math.min(...Object.values(byCategory)),
      priority: 0,
    });

    for (const [category, max] of Object.entries(byCategory)) {
      discountRules.push({ tier, category, max, priority: 10 });
    }
  }

  for (const rule of discountRules) {
    const customerTierId = tierByName.get(rule.tier)!;
    const categoryId = rule.category ? categoryByName.get(rule.category)! : null;

    const existing = await prisma.discountRule.findFirst({
      where: { customerTierId, categoryId },
    });

    if (existing) {
      await prisma.discountRule.update({
        where: { id: existing.id },
        data: { maxDiscountPercent: rule.max, priority: rule.priority },
      });
    } else {
      await prisma.discountRule.create({
        data: {
          customerTierId,
          categoryId,
          maxDiscountPercent: rule.max,
          priority: rule.priority,
        },
      });
    }
  }

  /* ── Approval policies keyed on risk score ──────── */

  const policySpecs = [
    {
      name: "Low Risk — Auto Approve",
      description: "Within tier ceilings and healthy margin. No human approval.",
      riskMin: 0,
      riskMax: 24.99,
      steps: [] as string[],
    },
    {
      name: "Medium Risk — Manager Approval",
      description: "Modest discount excess or margin pressure.",
      riskMin: 25,
      riskMax: 59.99,
      steps: ["SALES_MANAGER"],
    },
    {
      name: "High Risk — Manager then Finance",
      description: "Deep discount, thin margin, or a strategic account.",
      riskMin: 60,
      riskMax: 100,
      steps: ["SALES_MANAGER", "FINANCE"],
    },
  ];

  for (const spec of policySpecs) {
    const policy = await prisma.approvalPolicy.upsert({
      where: { name: spec.name },
      update: {
        description: spec.description,
        riskMin: spec.riskMin,
        riskMax: spec.riskMax,
      },
      create: {
        name: spec.name,
        description: spec.description,
        riskMin: spec.riskMin,
        riskMax: spec.riskMax,
      },
    });

    for (const [index, role] of spec.steps.entries()) {
      await prisma.approvalStep.upsert({
        where: {
          approvalPolicyId_stepOrder: {
            approvalPolicyId: policy.id,
            stepOrder: index + 1,
          },
        },
        update: { role },
        create: {
          approvalPolicyId: policy.id,
          stepOrder: index + 1,
          role,
        },
      });
    }
  }

  /* ── Warehouses ─────────────────────────────────── */

  const warehouseSpecs = [
    { code: "WH-EAST", name: "East Coast DC", address: "120 Harbor Rd, Newark NJ", weight: 1.0 },
    { code: "WH-WEST", name: "West Coast DC", address: "88 Bayfront Ave, Oakland CA", weight: 1.2 },
    { code: "WH-CENTRAL", name: "Central DC", address: "4400 Prairie Blvd, Dallas TX", weight: 0.9 },
  ];

  const warehouseIds: string[] = [];

  for (const spec of warehouseSpecs) {
    const warehouse = await prisma.warehouse.upsert({
      where: { code: spec.code },
      update: { name: spec.name, shippingCostWeight: spec.weight },
      create: {
        code: spec.code,
        name: spec.name,
        address: spec.address,
        shippingCostWeight: spec.weight,
      },
    });

    warehouseIds.push(warehouse.id);
  }

  /* ── Inventory ──────────────────────────────────── */

  // Deterministic spread so every re-seed produces the same stock picture:
  // plenty in most places, a couple of deliberately short SKUs to exercise
  // split allocation and backorders in M7.
  const stockLevels = [180, 60, 12, 0];

  for (const [productIndex, product] of products.entries()) {
    const productId = productBySku.get(product.sku)!;

    for (const [warehouseIndex, warehouseId] of warehouseIds.entries()) {
      const onHandQuantity = stockLevels[(productIndex + warehouseIndex) % stockLevels.length]!;

      // Postgres treats NULLs as distinct, so the @@unique on the nullable
      // variantId cannot be used as an upsert key here — look the row up first.
      const existing = await prisma.inventory.findFirst({
        where: { warehouseId, productId, variantId: null },
      });

      if (existing) {
        await prisma.inventory.update({
          where: { id: existing.id },
          data: { onHandQuantity },
        });
      } else {
        await prisma.inventory.create({
          data: {
            warehouseId,
            productId,
            onHandQuantity,
            reorderLevel: 20,
            reorderQuantity: 100,
          },
        });
      }
    }
  }

  /* ── Upsell / cross-sell relationships ──────────── */

  const relationships = [
    { from: "HW-SRV-1U", to: "HW-SRV-2U", type: RELATIONSHIP_TYPE.UPSELL, score: 0.82 },
    { from: "HW-SRV-1U", to: "SV-SUP-PREM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.91 },
    { from: "HW-SRV-1U", to: "SV-INST-RACK", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.74 },
    { from: "HW-SRV-1U", to: "HW-RAM-32", type: RELATIONSHIP_TYPE.ACCESSORY, score: 0.68 },
    { from: "HW-SRV-2U", to: "SV-SUP-PREM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.93 },
    { from: "HW-SRV-2U", to: "HW-SSD-2TB", type: RELATIONSHIP_TYPE.ACCESSORY, score: 0.79 },
    { from: "HW-LAP-14", to: "HW-LAP-16", type: RELATIONSHIP_TYPE.UPSELL, score: 0.85 },
    { from: "HW-LAP-14", to: "PR-DOCK-TB", type: RELATIONSHIP_TYPE.ACCESSORY, score: 0.88 },
    { from: "HW-LAP-14", to: "PR-MON-27", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.81 },
    { from: "HW-LAP-14", to: "SW-SEC-EP", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.77 },
    { from: "HW-LAP-16", to: "PR-DOCK-TB", type: RELATIONSHIP_TYPE.ACCESSORY, score: 0.86 },
    { from: "HW-LAP-16", to: "PR-MON-34", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.72 },
    { from: "HW-WKS-PRO", to: "PR-MON-34", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.8 },
    { from: "HW-NAS-24", to: "CL-BKP-ENT", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.83 },
    { from: "HW-NAS-24", to: "SV-MIG-DATA", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.7 },
    { from: "NW-SW-24P", to: "NW-SW-48P", type: RELATIONSHIP_TYPE.UPSELL, score: 0.87 },
    { from: "NW-SW-48P", to: "NW-CBL-CAT6", type: RELATIONSHIP_TYPE.ACCESSORY, score: 0.94 },
    { from: "NW-SW-48P", to: "NW-FW-ENT", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.66 },
    { from: "NW-FW-ENT", to: "SV-SUP-PREM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.78 },
    { from: "NW-AP-WIFI6", to: "NW-SW-24P", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.71 },
    { from: "SW-OS-SRV", to: "SW-VIRT-HV", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.75 },
    { from: "SW-DB-ENT", to: "SV-TRAIN-ADM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.69 },
    { from: "SW-DB-ENT", to: "SV-SUP-PREM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.84 },
    { from: "SW-OFF-BIZ", to: "SW-SEC-EP", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.73 },
    { from: "SW-BI-PRO", to: "SV-TRAIN-ADM", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.67 },
    { from: "SV-SUP-BASIC", to: "SV-SUP-PREM", type: RELATIONSHIP_TYPE.UPSELL, score: 0.9 },
    { from: "CL-COMP-STD", to: "CL-K8S-MGD", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.76 },
    { from: "CL-STOR-TB", to: "CL-BKP-ENT", type: RELATIONSHIP_TYPE.UPSELL, score: 0.88 },
    { from: "CL-STOR-TB", to: "CL-CDN-TB", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.64 },
    { from: "CL-K8S-MGD", to: "CL-DR-SITE", type: RELATIONSHIP_TYPE.CROSS_SELL, score: 0.7 },
  ];

  // "Only healthy margin suggestions surface" (spec A6): a pairing whose
  // priced margin for this customer falls under the floor is not shown at all.
  // 15% sits just above the thinnest hardware margins on the Enterprise price
  // list, so weak upsells drop out for that tier while healthy ones remain.
  const SUGGESTION_MARGIN_FLOOR = 15;

  for (const rel of relationships) {
    const sourceProductId = productBySku.get(rel.from)!;
    const targetProductId = productBySku.get(rel.to)!;

    await prisma.productRelationship.upsert({
      where: {
        sourceProductId_targetProductId_relationshipType: {
          sourceProductId,
          targetProductId,
          relationshipType: rel.type,
        },
      },
      update: { score: rel.score, minimumMarginPercent: SUGGESTION_MARGIN_FLOOR },
      create: {
        sourceProductId,
        targetProductId,
        relationshipType: rel.type,
        score: rel.score,
        minimumMarginPercent: SUGGESTION_MARGIN_FLOOR,
      },
    });
  }

  /* ── Subscription plans ─────────────────────────── */

  // Hybrid billing needs recurring plans that attach to the service and cloud
  // SKUs, so one order can mix a one-time server with a monthly support line.
  const planSpecs = [
    { name: "Monthly", billingInterval: "MONTH", intervalCount: 1, price: 0, cancellation: "Cancel any time, effective at period end.", refund: "Prorated credit note for the unused period." },
    { name: "Quarterly", billingInterval: "MONTH", intervalCount: 3, price: 0, cancellation: "Cancel with 30 days notice.", refund: "Prorated credit note for the unused period." },
    { name: "Annual", billingInterval: "YEAR", intervalCount: 1, price: 0, cancellation: "Cancel with 60 days notice.", refund: "Prorated credit note, less a 10% early-termination fee." },
  ];

  const planByName = new Map<string, string>();

  for (const spec of planSpecs) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: spec.name },
      update: {
        billingInterval: spec.billingInterval,
        intervalCount: spec.intervalCount,
        cancellationPolicy: spec.cancellation,
        refundPolicy: spec.refund,
      },
      create: {
        name: spec.name,
        billingInterval: spec.billingInterval,
        intervalCount: spec.intervalCount,
        price: spec.price,
        currencyCode: CURRENCY,
        prorationEnabled: true,
        cancellationPolicy: spec.cancellation,
        refundPolicy: spec.refund,
      },
    });

    planByName.set(spec.name, plan.id);
  }

  // Which products may be sold as a recurring line.
  const recurringSkus = [
    "SV-SUP-BASIC", "SV-SUP-PREM", "CL-COMP-STD", "CL-STOR-TB",
    "CL-BKP-ENT", "CL-DR-SITE", "CL-K8S-MGD", "SW-SEC-EP", "SW-OFF-BIZ",
  ];

  for (const sku of recurringSkus) {
    for (const planName of ["Monthly", "Quarterly", "Annual"]) {
      await prisma.productSubscriptionPlan.upsert({
        where: {
          productId_subscriptionPlanId: {
            productId: productBySku.get(sku)!,
            subscriptionPlanId: planByName.get(planName)!,
          },
        },
        update: {},
        create: {
          productId: productBySku.get(sku)!,
          subscriptionPlanId: planByName.get(planName)!,
        },
      });
    }
  }

  /* ── Promotions ─────────────────────────────────── */

  // Promoted products rank higher in the upsell panel (spec A6).
  const promotionSpecs = [
    { name: "Q3 Support Push", discountType: "PERCENT", discountValue: 10, skus: ["SV-SUP-PREM", "SV-SUP-BASIC"] },
    { name: "Cloud Migration Bundle", discountType: "PERCENT", discountValue: 15, skus: ["CL-BKP-ENT", "CL-DR-SITE", "SV-MIG-DATA"] },
    { name: "Peripheral Clearance", discountType: "PERCENT", discountValue: 20, skus: ["PR-MON-27", "PR-KB-MECH", "PR-HS-ANC"] },
  ];

  for (const spec of promotionSpecs) {
    const promotion = await prisma.promotion.upsert({
      where: { name: spec.name },
      update: { discountValue: spec.discountValue, isActive: true },
      create: {
        name: spec.name,
        description: `${spec.name} — ${spec.discountValue}% off`,
        discountType: spec.discountType,
        discountValue: spec.discountValue,
        startAt: new Date("2026-01-01"),
        endAt: new Date("2027-12-31"),
      },
    });

    for (const sku of spec.skus) {
      await prisma.promotionProduct.upsert({
        where: {
          promotionId_productId: {
            promotionId: promotion.id,
            productId: productBySku.get(sku)!,
          },
        },
        update: {},
        create: { promotionId: promotion.id, productId: productBySku.get(sku)! },
      });
    }
  }

  /* ── Tunable thresholds ─────────────────────────── */

  const settings = [
    { key: "STALLED_DEAL_DAYS", value: "7", description: "Days without activity before a quotation is flagged as stalled" },
    { key: "DISCOUNT_ANOMALY_MULTIPLIER", value: "1.5", description: "Multiple of a rep's average discount that counts as an anomaly" },
    { key: "APPROVAL_RISK_THRESHOLD", value: "25", description: "Blended risk score at or above which approval is required" },
    { key: "QUOTE_VALIDITY_DAYS", value: "30", description: "Default validity window for a new quotation" },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { description: setting.description },
      create: setting,
    });
  }

  /* ── Customers ──────────────────────────────────── */

  const customerSpecs = [
    { code: "CUST-001", name: "Northwind Logistics", tier: "Enterprise", rep: repId, email: "ap@northwind.example" },
    { code: "CUST-002", name: "Contoso Manufacturing", tier: "Enterprise", rep: repId, email: "purchasing@contoso.example" },
    { code: "CUST-003", name: "Fabrikam Health", tier: "Premium", rep: repId, email: "it@fabrikam.example" },
    { code: "CUST-004", name: "Tailspin Media", tier: "Premium", rep: rep2Id, email: "ops@tailspin.example" },
    { code: "CUST-005", name: "Adventure Works Retail", tier: "Premium", rep: rep2Id, email: "buyer@adventureworks.example" },
    { code: "CUST-006", name: "Lucerne Financial", tier: "Enterprise", rep: managerId, email: "procurement@lucerne.example" },
    { code: "CUST-007", name: "Wingtip Toys", tier: "Standard", rep: repId, email: "admin@wingtip.example" },
    { code: "CUST-008", name: "Proseware Analytics", tier: "Standard", rep: rep2Id, email: "hello@proseware.example" },
    { code: "CUST-009", name: "Litware Energy", tier: "Premium", rep: rep2Id, email: "supply@litware.example" },
    { code: "CUST-010", name: "Relecloud Hosting", tier: "Standard", rep: repId, email: "accounts@relecloud.example" },
  ];

  const customerIdByCode = new Map<string, string>();

  for (const spec of customerSpecs) {
    const customer = await prisma.customer.upsert({
      where: { customerCode: spec.code },
      update: {
        name: spec.name,
        customerTierId: tierByName.get(spec.tier)!,
        createdByUserId: spec.rep,
      },
      create: {
        customerCode: spec.code,
        name: spec.name,
        email: spec.email,
        phone: "+1-555-0100",
        billingAddress: "1 Market St, Springfield",
        shippingAddress: "1 Market St, Springfield",
        customerTierId: tierByName.get(spec.tier)!,
        createdByUserId: spec.rep,
      },
    });

    customerIdByCode.set(spec.code, customer.id);
  }

  /* ── Portal access ──────────────────────────────── */

  // The customer-facing negotiation screen is a restricted view of the
  // accounts a portal user is actually attached to, so the demo customer needs
  // that link or the portal has nothing to show.
  const portalUserId = userByEmail.get("customer@dealflow360.com")!;

  for (const [index, code] of ["CUST-001", "CUST-010"].entries()) {
    await prisma.customerUser.upsert({
      where: {
        customerId_userId: {
          customerId: customerIdByCode.get(code)!,
          userId: portalUserId,
        },
      },
      update: { isPrimary: index === 0 },
      create: {
        customerId: customerIdByCode.get(code)!,
        userId: portalUserId,
        isPrimary: index === 0,
      },
    });
  }

  console.log(`
Seed complete.
  users        ${users.length}  (password: ${DEMO_PASSWORD})
  tiers        ${tierSpecs.length}
  categories   ${categorySpecs.length}
  products     ${products.length}
  price lists  ${priceListSpecs.length}
  discounts    ${discountRules.length}
  policies     ${policySpecs.length}
  warehouses   ${warehouseSpecs.length}
  relations    ${relationships.length}
  plans        ${planSpecs.length}
  promotions   ${promotionSpecs.length}
  settings     ${settings.length}
  customers    ${customerSpecs.length}

Sign in as admin@dealflow360.com / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
