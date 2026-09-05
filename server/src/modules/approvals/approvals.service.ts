import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  APPROVAL_ACTION,
  APPROVAL_INSTANCE_STATUS,
  APPROVAL_STATUS,
  AUDIT_ACTION,
} from "../../common/constants/status.js";
import {
  hasAnyRole,
  isUserRole,
  type AuthUser,
  type UserRole,
} from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import { prisma } from "../../common/utils/prisma.js";
import { serialize } from "../../common/utils/serialize.js";
import type { ActInput, ListQueueQuery } from "./approvals.types.js";

/**
 * The approval chain for a quotation, built from whichever policy band its
 * blended risk score falls into. Everything here is driven by the score that
 * `quotations.recalculate()` already stores — approvals never re-derive it.
 */

const INSTANCE_SELECT = {
  id: true,
  quotationId: true,
  riskScore: true,
  status: true,
  triggerReason: true,
  startedAt: true,
  completedAt: true,
  approvalPolicy: {
    select: {
      id: true,
      name: true,
      description: true,
      riskMin: true,
      riskMax: true,
      steps: {
        orderBy: { stepOrder: "asc" as const },
        select: { id: true, stepOrder: true, role: true, isRequired: true },
      },
    },
  },
  actions: {
    orderBy: { actedAt: "asc" as const },
    select: {
      id: true,
      approvalStepId: true,
      action: true,
      comment: true,
      reason: true,
      actedAt: true,
      approver: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

/* ── lifecycle, called from the quotation recalculation ── */

/**
 * Opens (or rebuilds) the approval chain for a quotation that now needs one.
 *
 * An existing run is reused while the risk stays inside the same policy band,
 * so an approver's decisions are not thrown away by an unrelated edit. If the
 * score crosses into a different band the required approvers have genuinely
 * changed, so the old run is superseded and a fresh chain starts.
 */
export async function openApprovalInstance(
  quotationId: string,
  riskScore: number,
  reason: string,
) {
  const policy = await findPolicyFor(riskScore);

  if (!policy || policy.steps.length === 0) {
    // Nothing to route to — treat as not requiring approval rather than
    // parking the quote in a queue nobody owns.
    await cancelOpenInstances(quotationId, "No approval policy matched");

    return null;
  }

  const open = await prisma.approvalInstance.findFirst({
    where: { quotationId, status: APPROVAL_INSTANCE_STATUS.PENDING },
    select: { id: true, approvalPolicyId: true },
  });

  if (open) {
    if (open.approvalPolicyId === policy.id) {
      await prisma.approvalInstance.update({
        where: { id: open.id },
        data: { riskScore, triggerReason: reason },
      });

      return open.id;
    }

    await prisma.approvalInstance.update({
      where: { id: open.id },
      data: {
        status: APPROVAL_INSTANCE_STATUS.SUPERSEDED,
        completedAt: new Date(),
      },
    });

    await recordAudit({
      actorUserId: null,
      action: AUDIT_ACTION.STATUS_CHANGE,
      entityType: "ApprovalInstance",
      entityId: open.id,
      newValues: { status: APPROVAL_INSTANCE_STATUS.SUPERSEDED, riskScore },
      reason: "Risk moved into a different approval band",
    });
  }

  const instance = await prisma.approvalInstance.create({
    data: {
      quotationId,
      approvalPolicyId: policy.id,
      riskScore,
      status: APPROVAL_INSTANCE_STATUS.PENDING,
      triggerReason: reason,
    },
    select: { id: true },
  });

  await recordAudit({
    actorUserId: null,
    action: AUDIT_ACTION.CREATE,
    entityType: "ApprovalInstance",
    entityId: instance.id,
    newValues: {
      policy: policy.name,
      riskScore,
      chain: policy.steps.map((step) => step.role),
    },
    reason,
  });

  return instance.id;
}

/** Called when a quote drops back inside policy and no longer needs approval. */
export async function cancelOpenInstances(quotationId: string, reason: string) {
  const open = await prisma.approvalInstance.findMany({
    where: { quotationId, status: APPROVAL_INSTANCE_STATUS.PENDING },
    select: { id: true },
  });

  if (open.length === 0) {
    return;
  }

  await prisma.approvalInstance.updateMany({
    where: { id: { in: open.map((instance) => instance.id) } },
    data: {
      status: APPROVAL_INSTANCE_STATUS.CANCELLED,
      completedAt: new Date(),
    },
  });

  for (const instance of open) {
    await recordAudit({
      actorUserId: null,
      action: AUDIT_ACTION.STATUS_CHANGE,
      entityType: "ApprovalInstance",
      entityId: instance.id,
      newValues: { status: APPROVAL_INSTANCE_STATUS.CANCELLED },
      reason,
    });
  }
}

/* ── reading ──────────────────────────────────────── */

export async function getApproval(user: AuthUser, quotationId: string) {
  const quotation = await loadQuotation(user, quotationId);

  const instance = await prisma.approvalInstance.findFirst({
    where: { quotationId },
    orderBy: { startedAt: "desc" },
    select: INSTANCE_SELECT,
  });

  if (!instance) {
    return { approval: null, canAct: false, currentStep: null, steps: [] };
  }

  const steps = await describeSteps(instance);
  const currentStep = steps.find((step) => step.state === "CURRENT") ?? null;

  return {
    approval: serialize({
      id: instance.id,
      status: instance.status,
      riskScore: instance.riskScore,
      triggerReason: instance.triggerReason,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      policy: instance.approvalPolicy,
    }),
    steps,
    currentStep,
    canAct: canUserActOn(user, currentStep, instance.status, quotation.salesRepId)
      .allowed,
    blockedReason: canUserActOn(
      user,
      currentStep,
      instance.status,
      quotation.salesRepId,
    ).reason,
  };
}

/** The approver queue: quotations waiting on a step this user can action. */
export async function listQueue(user: AuthUser, query: ListQueueQuery) {
  const instances = await prisma.approvalInstance.findMany({
    where: { status: APPROVAL_INSTANCE_STATUS.PENDING },
    orderBy: { startedAt: "asc" },
    select: {
      ...INSTANCE_SELECT,
      quotation: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          approvalStatus: true,
          grandTotal: true,
          currencyCode: true,
          blendedRiskScore: true,
          salesRepId: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              customerTier: { select: { name: true } },
            },
          },
          salesRep: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const rows = await Promise.all(
    instances.map(async (instance) => {
      const steps = await describeSteps(instance);
      const currentStep = steps.find((step) => step.state === "CURRENT") ?? null;
      const permission = canUserActOn(
        user,
        currentStep,
        instance.status,
        instance.quotation.salesRepId,
      );

      return {
        quotation: serialize(instance.quotation),
        riskScore: Number(instance.riskScore),
        policyName: instance.approvalPolicy?.name ?? null,
        triggerReason: instance.triggerReason,
        startedAt: instance.startedAt.toISOString(),
        currentStep,
        chain: steps.map((step) => ({
          role: step.role,
          state: step.state,
          stepOrder: step.stepOrder,
        })),
        canAct: permission.allowed,
        blockedReason: permission.reason,
      };
    }),
  );

  return query.scope === "mine" ? rows.filter((row) => row.canAct) : rows;
}

/* ── acting ───────────────────────────────────────── */

export async function act(
  user: AuthUser,
  quotationId: string,
  input: ActInput,
  request?: Parameters<typeof recordAudit>[0]["request"],
) {
  const quotation = await loadQuotation(user, quotationId);

  const instance = await prisma.approvalInstance.findFirst({
    where: { quotationId, status: APPROVAL_INSTANCE_STATUS.PENDING },
    orderBy: { startedAt: "desc" },
    select: INSTANCE_SELECT,
  });

  if (!instance) {
    throw new ValidationError("This quotation has no approval in progress", [
      "approval: nothing to act on",
    ]);
  }

  const steps = await describeSteps(instance);
  const currentStep = steps.find((step) => step.state === "CURRENT") ?? null;
  const permission = canUserActOn(
    user,
    currentStep,
    instance.status,
    quotation.salesRepId,
  );

  if (!permission.allowed || !currentStep) {
    throw new ForbiddenError(permission.reason ?? "You cannot act on this step");
  }

  await prisma.approvalAction.create({
    data: {
      approvalInstanceId: instance.id,
      approvalStepId: currentStep.id,
      approverUserId: user.sub,
      action: input.action,
      comment: input.comment ?? null,
      reason: input.reason ?? null,
    },
  });

  const remaining = steps.filter(
    (step) => step.stepOrder > currentStep.stepOrder,
  );

  const outcome = resolveOutcome(input.action, remaining.length > 0);

  if (outcome.instanceStatus !== APPROVAL_INSTANCE_STATUS.PENDING) {
    await prisma.approvalInstance.update({
      where: { id: instance.id },
      data: { status: outcome.instanceStatus, completedAt: new Date() },
    });
  }

  if (outcome.quotationApprovalStatus) {
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { approvalStatus: outcome.quotationApprovalStatus },
    });
  }

  await recordAudit({
    actorUserId: user.sub,
    action:
      input.action === APPROVAL_ACTION.APPROVE
        ? AUDIT_ACTION.APPROVE
        : AUDIT_ACTION.REJECT,
    entityType: "Quotation",
    entityId: quotationId,
    oldValues: { approvalStatus: quotation.approvalStatus },
    newValues: {
      action: input.action,
      step: currentStep.role,
      stepOrder: currentStep.stepOrder,
      approvalStatus: outcome.quotationApprovalStatus,
      remainingSteps: remaining.map((step) => step.role),
    },
    reason: input.reason ?? input.comment,
    request,
  });

  return getApproval(user, quotationId);
}

/* ── helpers ──────────────────────────────────────── */

type StepState = "APPROVED" | "CURRENT" | "WAITING" | "BLOCKED";

type DescribedStep = {
  id: string;
  stepOrder: number;
  role: string;
  isRequired: boolean;
  state: StepState;
  approvers: { id: string; firstName: string; lastName: string }[];
  action: {
    action: string;
    comment: string | null;
    reason: string | null;
    actedAt: string;
    approver: { id: string; firstName: string; lastName: string };
  } | null;
};

/**
 * Walks the chain in order and labels each step. The first step without an
 * approval is the current one; anything after it is still waiting. Once the
 * run has ended, nothing is current.
 */
async function describeSteps(instance: {
  status: string;
  approvalPolicy: {
    steps: { id: string; stepOrder: number; role: string; isRequired: boolean }[];
  } | null;
  actions: {
    approvalStepId: string;
    action: string;
    comment: string | null;
    reason: string | null;
    actedAt: Date;
    approver: { id: string; firstName: string; lastName: string };
  }[];
}): Promise<DescribedStep[]> {
  const policySteps = instance.approvalPolicy?.steps ?? [];

  if (policySteps.length === 0) {
    return [];
  }

  const approversByRole = await approversFor(
    policySteps.map((step) => step.role),
  );

  const running = instance.status === APPROVAL_INSTANCE_STATUS.PENDING;
  let currentAssigned = false;

  return policySteps.map((step) => {
    const action = instance.actions.find(
      (entry) => entry.approvalStepId === step.id,
    );

    let state: StepState;

    if (action?.action === APPROVAL_ACTION.APPROVE) {
      state = "APPROVED";
    } else if (action) {
      // A reject or return ends the run at this step.
      state = "BLOCKED";
    } else if (running && !currentAssigned) {
      state = "CURRENT";
      currentAssigned = true;
    } else {
      state = "WAITING";
    }

    return {
      id: step.id,
      stepOrder: step.stepOrder,
      role: step.role,
      isRequired: step.isRequired,
      state,
      approvers: approversByRole.get(step.role) ?? [],
      action: action
        ? {
            action: action.action,
            comment: action.comment,
            reason: action.reason,
            actedAt: action.actedAt.toISOString(),
            approver: action.approver,
          }
        : null,
    };
  });
}

/** Everyone holding each role in the chain — the spec's "correct approver". */
async function approversFor(roles: string[]) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: { in: [...new Set(roles)] } } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });

  const byRole = new Map<string, { id: string; firstName: string; lastName: string }[]>();

  for (const user of users) {
    for (const entry of user.userRoles) {
      const role = entry.role.name;

      if (!roles.includes(role)) {
        continue;
      }

      const list = byRole.get(role) ?? [];
      list.push({ id: user.id, firstName: user.firstName, lastName: user.lastName });
      byRole.set(role, list);
    }
  }

  return byRole;
}

function canUserActOn(
  user: AuthUser,
  currentStep: DescribedStep | null,
  instanceStatus: string,
  salesRepId: string,
): { allowed: boolean; reason?: string } {
  if (instanceStatus !== APPROVAL_INSTANCE_STATUS.PENDING) {
    return { allowed: false, reason: "This approval has already been decided" };
  }

  if (!currentStep) {
    return { allowed: false, reason: "There is no step awaiting a decision" };
  }

  // A rep who also holds an approver role must not sign off their own deal.
  if (salesRepId === user.sub) {
    return {
      allowed: false,
      reason: "You cannot approve a quotation you own",
    };
  }

  if (!isUserRole(currentStep.role)) {
    return { allowed: false, reason: `Unknown approver role ${currentStep.role}` };
  }

  if (!hasAnyRole(user, [currentStep.role as UserRole])) {
    return {
      allowed: false,
      reason: `This step needs ${currentStep.role.replace(/_/g, " ").toLowerCase()}`,
    };
  }

  return { allowed: true };
}

function resolveOutcome(action: string, hasRemainingSteps: boolean) {
  if (action === APPROVAL_ACTION.REJECT) {
    return {
      instanceStatus: APPROVAL_INSTANCE_STATUS.REJECTED,
      quotationApprovalStatus: APPROVAL_STATUS.REJECTED,
    };
  }

  if (action === APPROVAL_ACTION.RETURN) {
    return {
      instanceStatus: APPROVAL_INSTANCE_STATUS.RETURNED,
      quotationApprovalStatus: APPROVAL_STATUS.RETURNED,
    };
  }

  // Approved, but a later step still has to sign off.
  if (hasRemainingSteps) {
    return {
      instanceStatus: APPROVAL_INSTANCE_STATUS.PENDING,
      quotationApprovalStatus: APPROVAL_STATUS.PENDING,
    };
  }

  return {
    instanceStatus: APPROVAL_INSTANCE_STATUS.APPROVED,
    quotationApprovalStatus: APPROVAL_STATUS.APPROVED,
  };
}

/** The band a score falls into; the narrowest matching policy wins. */
async function findPolicyFor(riskScore: number) {
  return prisma.approvalPolicy.findFirst({
    where: {
      isActive: true,
      riskMin: { lte: riskScore },
      riskMax: { gte: riskScore },
    },
    orderBy: { riskMin: "desc" },
    select: {
      id: true,
      name: true,
      steps: {
        orderBy: { stepOrder: "asc" },
        select: { id: true, role: true, stepOrder: true },
      },
    },
  });
}

async function loadQuotation(user: AuthUser, quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      salesRepId: true,
      approvalStatus: true,
      status: true,
    },
  });

  if (!quotation) {
    throw new NotFoundError("Quotation not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && quotation.salesRepId !== user.sub) {
    throw new ForbiddenError("This quotation belongs to another sales rep");
  }

  return quotation;
}
