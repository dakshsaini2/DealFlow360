import { prisma } from "./prisma.js";

/**
 * Admin-tunable thresholds. The spec describes several of these as
 * "configured", so they live in the `SystemSetting` table rather than as
 * constants — these are the defaults used when a key has not been set.
 */
export const SETTING_DEFAULTS = {
  /** Days without activity before a quotation counts as stalled (B9). */
  STALLED_DEAL_DAYS: "7",
  /** A discount this many times a rep's average is flagged as an anomaly. */
  DISCOUNT_ANOMALY_MULTIPLIER: "1.5",
  /** Risk score at or above which a quotation needs approval at all. */
  APPROVAL_RISK_THRESHOLD: "25",
  /** Default validity window applied to a new quotation, in days. */
  QUOTE_VALIDITY_DAYS: "30",
  /**
   * Cost of dispatching one shipment before the warehouse's own
   * `shippingCostWeight` is applied. The split engine minimises the number of
   * shipments, so this is what makes a second warehouse "expensive".
   */
  SHIPMENT_BASE_COST: "45",
  /** Days after allocation that stock is expected to arrive for a backorder. */
  BACKORDER_RESTOCK_DAYS: "14",
  /** How many upcoming billing periods are scheduled ahead for a subscription. */
  BILLING_SCHEDULE_HORIZON: "12",
  /** Days a new invoice is given to be paid. */
  INVOICE_DUE_DAYS: "30",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });

  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getNumericSetting(key: SettingKey): Promise<number> {
  const parsed = Number(await getSetting(key));

  return Number.isFinite(parsed) ? parsed : Number(SETTING_DEFAULTS[key]);
}

export async function setSetting(
  key: SettingKey,
  value: string,
  description?: string,
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value, ...(description ? { description } : {}) },
    create: { key, value, description: description ?? null },
  });
}

/** Every setting with its effective value, for the admin settings screen. */
export async function getAllSettings() {
  const rows = await prisma.systemSetting.findMany();
  const overrides = new Map(rows.map((row) => [row.key, row.value]));

  return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => ({
    key,
    value: overrides.get(key) ?? SETTING_DEFAULTS[key],
    isDefault: !overrides.has(key),
  }));
}
