import type { Request } from "express";
import { AUDIT_ACTION } from "../constants/status.js";
import { prisma } from "./prisma.js";

/**
 * The spec requires every approval, rejection and edit to be recorded with the
 * acting user, a timestamp and a reason. Call this from a service after the
 * change it describes has committed.
 *
 * Writing an audit row must never take down the operation it is describing, so
 * a failure here is logged and swallowed.
 */
export type AuditEntry = {
  actorUserId: string | null;
  action: (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
  entityType: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
  /** Pass the Express request to capture IP and user agent. */
  request?: Pick<Request, "ip" | "headers">;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: toJson(entry.oldValues),
        newValues: toJson(entry.newValues),
        reason: entry.reason ?? null,
        ipAddress: entry.request?.ip ?? null,
        userAgent: readUserAgent(entry.request) ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * Prisma's Json column rejects `undefined`, and Decimal/Date values need to be
 * plain before they can be stored, so snapshots go through JSON first.
 */
function toJson(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value, replaceUnserializable));
}

function replaceUnserializable(_key: string, value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return value;
}

function readUserAgent(request: AuditEntry["request"]): string | null {
  const header = request?.headers?.["user-agent"];

  return typeof header === "string" ? header : null;
}
