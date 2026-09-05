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
