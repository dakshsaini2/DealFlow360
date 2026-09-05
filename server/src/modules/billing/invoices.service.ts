import { NotFoundError, ValidationError } from "../../common/errors/AppError.js";
import { ForbiddenError } from "../../common/errors/AuthError.js";
import {
  AUDIT_ACTION,
  BILLING_SCHEDULE_STATUS,
  CREDIT_NOTE_STATUS,
  INVOICE_STATUS,
  INVOICE_TYPE,
  LINE_TYPE,
  PAYMENT_STATUS,
} from "../../common/constants/status.js";
import { hasAnyRole, type AuthUser } from "../../common/types/auth.types.js";
import { recordAudit } from "../../common/utils/audit.js";
import {
  paginated,
  type PageParams,
  type Paginated,
} from "../../common/utils/pagination.js";
import { prisma } from "../../common/utils/prisma.js";
import { round2, serialize } from "../../common/utils/serialize.js";
import { getNumericSetting } from "../../common/utils/settings.js";
import type {
  IssueRecurringInput,
  ListInvoicesQuery,
  RecordPaymentInput,
} from "./billing.types.js";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const LIST_SELECT = {
  id: true,
  invoiceNumber: true,
  invoiceType: true,
  status: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  amountPaid: true,
  amountDue: true,
  currencyCode: true,
  issuedAt: true,
  dueAt: true,
  paidAt: true,
  customer: { select: { id: true, name: true, customerCode: true } },
  order: { select: { id: true, orderNumber: true } },
  _count: { select: { lines: true, payments: true } },
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  lines: {
    orderBy: { periodStart: "asc" as const },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      taxAmount: true,
      lineTotal: true,
      periodStart: true,
      periodEnd: true,
      orderLine: {
        select: {
          id: true,
          lineType: true,
          product: { select: { id: true, sku: true, name: true } },
        },
      },
      subscriptionLine: {
        select: {
          id: true,
          product: { select: { id: true, sku: true, name: true } },
          subscriptionPlan: { select: { id: true, name: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      amount: true,
      currencyCode: true,
      paymentMethod: true,
      transactionReference: true,
      status: true,
      paidAt: true,
      createdAt: true,
    },
  },
  creditNotes: {
    orderBy: { issuedAt: "desc" as const },
    select: {
      id: true,
      creditNoteNumber: true,
      reason: true,
      amount: true,
      status: true,
      issuedAt: true,
    },
  },
} as const;

/**
 * Raises the one-time invoice for a confirmed order.
 *
 * Only `ONE_TIME` lines land here — recurring lines are billed by their own
 * schedule, period by period. That separation is the whole point of hybrid
 * billing: the customer gets one bill for the hardware now and a different bill
 * every month for the service, rather than a single number that means neither.
 */
export async function issueOrderInvoice(
  tx: TransactionClient,
  orderId: string,
  dueDays: number,
): Promise<string | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      currencyCode: true,
      lines: {
        where: { lineType: LINE_TYPE.ONE_TIME },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          taxAmount: true,
          lineTotal: true,
          product: { select: { name: true, sku: true } },
        },
      },
    },
  });

  if (!order || order.lines.length === 0) {
    return null;
  }

  const subtotal = round2(
    order.lines.reduce(
      (total, line) => total + Number(line.quantity) * Number(line.unitPrice),
      0,
    ),
  );
  const discountTotal = round2(
    order.lines.reduce((total, line) => total + Number(line.discountAmount), 0),
  );
  const taxTotal = round2(
    order.lines.reduce((total, line) => total + Number(line.taxAmount), 0),
  );
  const grandTotal = round2(
    order.lines.reduce((total, line) => total + Number(line.lineTotal), 0),
  );

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(tx),
      customerId: order.customerId,
      orderId: order.id,
      invoiceType: INVOICE_TYPE.ONE_TIME,
      status: INVOICE_STATUS.ISSUED,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      amountPaid: 0,
      amountDue: grandTotal,
      currencyCode: order.currencyCode,
      dueAt: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
      lines: {
        create: order.lines.map((line) => ({
          orderLineId: line.id,
          description: line.description ?? line.product.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        })),
      },
    },
    select: { id: true },
  });

  return invoice.id;
}

/**
 * Bills every subscription period that has come due. One invoice per
 * subscription per run, so a customer with three recurring lines on one order
 * gets one bill rather than three.
 */
export async function issueRecurringInvoices(
  user: AuthUser,
  input: IssueRecurringInput,
) {
  const upTo = input.upTo ? new Date(input.upTo) : new Date();
  const dueDays = await getNumericSetting("INVOICE_DUE_DAYS");

  const due = await prisma.billingSchedule.findMany({
    where: {
      status: BILLING_SCHEDULE_STATUS.SCHEDULED,
      billingDate: { lte: upTo },
      ...(input.subscriptionId
        ? { subscriptionLine: { subscriptionId: input.subscriptionId } }
        : {}),
    },
    orderBy: { billingDate: "asc" },
    select: {
      id: true,
      billingDate: true,
      periodStart: true,
      periodEnd: true,
      quantity: true,
      amount: true,
      prorationAmount: true,
      subscriptionLine: {
        select: {
          id: true,
          unitPrice: true,
          subscriptionId: true,
          // Recurring periods are taxed at the same rate the order was priced
          // at, or a monthly bill would come in under what the deal promised.
          product: { select: { name: true, sku: true, taxRate: true } },
          subscriptionPlan: { select: { name: true } },
          subscription: {
            select: { id: true, customerId: true, currencyCode: true, orderId: true },
          },
        },
      },
    },
  });

  if (due.length === 0) {
    return { issued: [], message: "No billing periods are due." };
  }

  // Group by subscription so each customer relationship produces one bill.
  const bySubscription = new Map<string, typeof due>();

  for (const schedule of due) {
    const key = schedule.subscriptionLine.subscriptionId;
    const bucket = bySubscription.get(key) ?? [];

    bucket.push(schedule);
    bySubscription.set(key, bucket);
  }

  const issued: { invoiceId: string; invoiceNumber: string; grandTotal: number }[] = [];

  for (const [subscriptionId, schedules] of bySubscription) {
    const first = schedules[0]!.subscriptionLine.subscription;

    // Each period is priced net first, then taxed, so a recurring bill is
    // built the same way the one-time invoice was.
    const priced = schedules.map((schedule) => {
      const net = round2(
        Number(schedule.amount) + Number(schedule.prorationAmount),
      );
      const taxAmount = round2(
        net * (Number(schedule.subscriptionLine.product.taxRate) / 100),
      );

      return { schedule, net, taxAmount, lineTotal: round2(net + taxAmount) };
    });

    const subtotal = round2(priced.reduce((total, row) => total + row.net, 0));
    const taxTotal = round2(priced.reduce((total, row) => total + row.taxAmount, 0));
    const grandTotal = round2(subtotal + taxTotal);

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(tx),
          customerId: first.customerId,
          orderId: first.orderId,
          invoiceType: INVOICE_TYPE.RECURRING,
          status: INVOICE_STATUS.ISSUED,
          subtotal,
          discountTotal: 0,
          taxTotal,
          grandTotal,
          amountPaid: 0,
          amountDue: grandTotal,
          currencyCode: first.currencyCode,
          dueAt: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
          lines: {
            create: priced.map(({ schedule, taxAmount, lineTotal }) => ({
              subscriptionLineId: schedule.subscriptionLine.id,
              description: `${schedule.subscriptionLine.product.name} — ${
                schedule.subscriptionLine.subscriptionPlan.name
              } (${schedule.periodStart.toISOString().slice(0, 10)} to ${schedule.periodEnd
                .toISOString()
                .slice(0, 10)})`,
              quantity: schedule.quantity,
              unitPrice: schedule.subscriptionLine.unitPrice,
              discountAmount: 0,
              taxAmount,
              // The proration from a mid-cycle change rides on this period's
              // line rather than becoming a separate bill.
              lineTotal,
              periodStart: schedule.periodStart,
              periodEnd: schedule.periodEnd,
            })),
          },
        },
        select: { id: true, invoiceNumber: true },
      });

      await tx.billingSchedule.updateMany({
        where: { id: { in: schedules.map((schedule) => schedule.id) } },
        data: { status: BILLING_SCHEDULE_STATUS.INVOICED, invoiceId: created.id },
      });

      // The subscription's clock moves to the period after the last one billed.
      const latest = schedules.reduce(
        (newest, schedule) =>
          schedule.periodEnd > newest ? schedule.periodEnd : newest,
        schedules[0]!.periodEnd,
      );

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { nextBillingDate: latest },
      });

      for (const schedule of schedules) {
        await tx.subscriptionLine.update({
          where: { id: schedule.subscriptionLine.id },
          data: {
            currentPeriodStart: schedule.periodStart,
            currentPeriodEnd: schedule.periodEnd,
          },
        });
      }

      return created;
    });

    issued.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, grandTotal });

    await recordAudit({
      actorUserId: user.sub,
      action: AUDIT_ACTION.CREATE,
      entityType: "Invoice",
      entityId: invoice.id,
      newValues: {
        invoiceNumber: invoice.invoiceNumber,
        type: INVOICE_TYPE.RECURRING,
        periods: schedules.length,
        grandTotal,
      },
      reason: "Recurring billing run",
    });
  }

  return {
    issued,
    message: `Issued ${issued.length} recurring invoice${issued.length === 1 ? "" : "s"}.`,
  };
}

export async function listInvoices(
  user: AuthUser,
  query: ListInvoicesQuery,
  page: PageParams,
): Promise<Paginated<unknown>> {
  const where = {
    ...visibilityFilter(user, query.scope),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.invoiceType ? { invoiceType: query.invoiceType } : {}),
    ...(query.q
      ? {
          OR: [
            { invoiceNumber: { contains: query.q, mode: "insensitive" as const } },
            {
              customer: {
                name: { contains: query.q, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: page.skip,
      take: page.take,
      select: LIST_SELECT,
    }),
    prisma.invoice.count({ where }),
  ]);

  return paginated(serialize(rows), total, page);
}

export async function getInvoice(user: AuthUser, id: string) {
  const invoice = await loadForRead(user, id);

  return { invoice: serialize(invoice) };
}

/**
 * Records a payment against an invoice and moves its status.
 *
 * The status is derived from what has actually been received rather than set by
 * the caller, so `PARTIALLY_PAID` and `PAID` cannot disagree with the payment
 * rows underneath them.
 */
export async function recordPayment(
  user: AuthUser,
  invoiceId: string,
  input: RecordPaymentInput,
) {
  const invoice = await loadForRead(user, invoiceId);

  if (invoice.status === INVOICE_STATUS.VOID) {
    throw new ValidationError("A void invoice cannot be paid", [
      "status: invoice is void",
    ]);
  }

  if (invoice.status === INVOICE_STATUS.PAID) {
    throw new ValidationError("This invoice is already paid in full", [
      "status: invoice is paid",
    ]);
  }

  const amountDue = Number(invoice.amountDue);

  if (input.amount > amountDue + 0.005) {
    throw new ValidationError(
      `That is more than the ${amountDue.toFixed(2)} still outstanding`,
      [`amount: at most ${amountDue.toFixed(2)}`],
    );
  }

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId,
        customerId: invoice.customer.id,
        amount: input.amount,
        currencyCode: invoice.currencyCode,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference ?? null,
        status: PAYMENT_STATUS.COMPLETED,
        paidAt,
      },
    });

    await settleInvoice(tx, invoiceId);
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.UPDATE,
    entityType: "Invoice",
    entityId: invoiceId,
    oldValues: { status: invoice.status, amountPaid: Number(invoice.amountPaid) },
    newValues: { payment: input.amount, method: input.paymentMethod },
    reason: input.reason ?? "Payment recorded",
  });

  return getInvoice(user, invoiceId);
}

/**
 * Issues a credit note for the unused part of a cancelled subscription period.
 *
 * It is applied to the most recent recurring invoice for that subscription,
 * because that is the bill the customer actually paid for the period being
 * given back. With nothing invoiced yet there is nothing to credit, and the
 * cancellation simply stops future billing.
 */
export async function issueCancellationCredit(
  user: AuthUser,
  subscriptionId: string,
  amount: number,
  reason: string,
) {
  if (amount <= 0) {
    return null;
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      status: { notIn: [INVOICE_STATUS.VOID, INVOICE_STATUS.DRAFT] },
      lines: { some: { subscriptionLine: { subscriptionId } } },
    },
    orderBy: { issuedAt: "desc" },
    select: { id: true, customerId: true, currencyCode: true, grandTotal: true },
  });

  if (!invoice) {
    return null;
  }

  // Never credit back more than the invoice was worth.
  const creditable = round2(Math.min(amount, Number(invoice.grandTotal)));

  const creditNote = await prisma.creditNote.create({
    data: {
      creditNoteNumber: await nextCreditNoteNumber(prisma),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      reason,
      amount: creditable,
      currencyCode: invoice.currencyCode,
      status: CREDIT_NOTE_STATUS.ISSUED,
    },
    select: { id: true, creditNoteNumber: true, amount: true },
  });

  await recordAudit({
    actorUserId: user.sub,
    action: AUDIT_ACTION.CREATE,
    entityType: "CreditNote",
    entityId: creditNote.id,
    newValues: {
      creditNoteNumber: creditNote.creditNoteNumber,
      amount: creditable,
      invoiceId: invoice.id,
    },
    reason,
  });

  return serialize(creditNote);
}

/* ── helpers ──────────────────────────────────────── */

/**
 * Recomputes an invoice's paid/due figures and status from its payment and
 * credit-note rows. This is the only place invoice status is written, so it
 * cannot drift from the money actually received.
 */
async function settleInvoice(tx: TransactionClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      grandTotal: true,
      dueAt: true,
      status: true,
      payments: {
        where: { status: PAYMENT_STATUS.COMPLETED },
        select: { amount: true },
      },
      creditNotes: {
        where: { status: { in: [CREDIT_NOTE_STATUS.ISSUED, CREDIT_NOTE_STATUS.APPLIED] } },
        select: { amount: true },
      },
    },
  });

  if (!invoice) {
    return;
  }

  const grandTotal = Number(invoice.grandTotal);
  const paid = invoice.payments.reduce((total, row) => total + Number(row.amount), 0);
  const credited = invoice.creditNotes.reduce(
    (total, row) => total + Number(row.amount),
    0,
  );

  // A credit note settles part of the bill just as a payment does.
  const covered = round2(paid + credited);
  const amountDue = round2(Math.max(0, grandTotal - covered));

  const status =
    covered >= grandTotal - 0.005
      ? INVOICE_STATUS.PAID
      : covered > 0
        ? INVOICE_STATUS.PARTIALLY_PAID
        : invoice.dueAt && invoice.dueAt < new Date()
          ? INVOICE_STATUS.OVERDUE
          : INVOICE_STATUS.ISSUED;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: round2(paid),
      amountDue,
      status,
      paidAt: status === INVOICE_STATUS.PAID ? new Date() : null,
    },
  });
}

function visibilityFilter(user: AuthUser, scope: "all" | "mine") {
  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  return orgWide && scope === "all" ? {} : { order: { salesRepId: user.sub } };
}

async function loadForRead(user: AuthUser, id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { ...DETAIL_SELECT, order: { select: { id: true, orderNumber: true, salesRepId: true } } },
  });

  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }

  const orgWide = hasAnyRole(user, ["ADMIN", "SALES_MANAGER", "FINANCE"]);

  if (!orgWide && invoice.order && invoice.order.salesRepId !== user.sub) {
    throw new ForbiddenError("This invoice belongs to another sales rep");
  }

  return invoice;
}

type NumberingClient = {
  invoice: {
    findFirst: (args: {
      where: { invoiceNumber: { startsWith: string } };
      orderBy: { invoiceNumber: "desc" };
      select: { invoiceNumber: true };
    }) => Promise<{ invoiceNumber: string } | null>;
  };
};

async function nextInvoiceNumber(client: NumberingClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const latest = await client.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const current = Number(latest?.invoiceNumber.slice(prefix.length) ?? 0);

  return `${prefix}${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, "0")}`;
}

type CreditNumberingClient = {
  creditNote: {
    findFirst: (args: {
      where: { creditNoteNumber: { startsWith: string } };
      orderBy: { creditNoteNumber: "desc" };
      select: { creditNoteNumber: true };
    }) => Promise<{ creditNoteNumber: string } | null>;
  };
};

async function nextCreditNoteNumber(client: CreditNumberingClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CN-${year}-`;

  const latest = await client.creditNote.findFirst({
    where: { creditNoteNumber: { startsWith: prefix } },
    orderBy: { creditNoteNumber: "desc" },
    select: { creditNoteNumber: true },
  });

  const current = Number(latest?.creditNoteNumber.slice(prefix.length) ?? 0);

  return `${prefix}${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, "0")}`;
}
