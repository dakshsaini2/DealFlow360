/**
 * The schema stores every status as a plain `String`, so these are the single
 * source of truth for the values the application is allowed to write. Import
 * from here instead of typing a literal at a call site.
 */

export const QUOTATION_STATUS = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  UNDER_NEGOTIATION: "UNDER_NEGOTIATION",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type QuotationStatus =
  (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS];

export const APPROVAL_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RETURNED: "RETURNED",
} as const;

export type ApprovalStatus =
  (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

/** Lifecycle of one approval workflow run against a quotation. */
export const APPROVAL_INSTANCE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RETURNED: "RETURNED",
  /** The risk moved into a different policy band, so the chain was rebuilt. */
  SUPERSEDED: "SUPERSEDED",
  /** The quote came back inside policy and no longer needs approval. */
  CANCELLED: "CANCELLED",
} as const;

export type ApprovalInstanceStatus =
  (typeof APPROVAL_INSTANCE_STATUS)[keyof typeof APPROVAL_INSTANCE_STATUS];

export const APPROVAL_ACTION = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  RETURN: "RETURN",
} as const;

export type ApprovalActionType =
  (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION];

export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  ALLOCATED: "ALLOCATED",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const FULFILLMENT_STATUS = {
  PENDING: "PENDING",
  ALLOCATED: "ALLOCATED",
  PICKING: "PICKING",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;

export type FulfillmentStatus =
  (typeof FULFILLMENT_STATUS)[keyof typeof FULFILLMENT_STATUS];

export const BACKORDER_STATUS = {
  OPEN: "OPEN",
  CONSOLIDATED: "CONSOLIDATED",
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
} as const;

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** One dated row on a subscription line's forward billing plan. */
export const BILLING_SCHEDULE_STATUS = {
  SCHEDULED: "SCHEDULED",
  INVOICED: "INVOICED",
  PAID: "PAID",
  SKIPPED: "SKIPPED",
  CANCELLED: "CANCELLED",
} as const;

/** Why a mid-cycle adjustment was raised. */
export const PRORATION_EVENT_TYPE = {
  QUANTITY_CHANGE: "QUANTITY_CHANGE",
  PLAN_CHANGE: "PLAN_CHANGE",
  CANCELLATION: "CANCELLATION",
} as const;

export const INVOICE_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  VOID: "VOID",
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

/** A one-time sale bills once; a recurring period bills every cycle. */
export const INVOICE_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;

export const PAYMENT_METHOD = {
  BANK_TRANSFER: "BANK_TRANSFER",
  CARD: "CARD",
  CHEQUE: "CHEQUE",
  CREDIT_NOTE: "CREDIT_NOTE",
} as const;

export const CREDIT_NOTE_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  APPLIED: "APPLIED",
  VOID: "VOID",
} as const;

export const CHANGE_REQUEST_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export const RELATIONSHIP_TYPE = {
  UPSELL: "UPSELL",
  CROSS_SELL: "CROSS_SELL",
  ACCESSORY: "ACCESSORY",
  SUBSTITUTE: "SUBSTITUTE",
} as const;

export type RelationshipType =
  (typeof RELATIONSHIP_TYPE)[keyof typeof RELATIONSHIP_TYPE];

export const RECOMMENDATION_ACTION = {
  /** Logged the first time a suggestion is put in front of the rep. */
  SHOWN: "SHOWN",
  ACCEPTED: "ACCEPTED",
  DISMISSED: "DISMISSED",
} as const;

export type RecommendationAction =
  (typeof RECOMMENDATION_ACTION)[keyof typeof RECOMMENDATION_ACTION];

export const LINE_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
} as const;

export const ALLOCATION_METHOD = {
  SINGLE_WAREHOUSE: "SINGLE_WAREHOUSE",
  SPLIT: "SPLIT",
  BACKORDER: "BACKORDER",
} as const;

export const ALERT_SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  STATUS_CHANGE: "STATUS_CHANGE",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
} as const;
