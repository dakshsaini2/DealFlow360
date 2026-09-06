import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Repeat, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Modal,
  TextAreaField,
  TextField,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { maxLength, numeric, required, useValidation } from '../../../util/validation';
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import { planCadence } from '../../../util/orders';
import { useAuth } from '../../../hooks/useAuth';
import {
  SCHEDULE_TONE,
  SUBSCRIPTION_TONE,
  cancelSubscription,
  changeSubscriptionQuantity,
  fetchSubscriptionForOrder,
  runRecurringBilling,
  type CancelResponse,
  type SubscriptionLine,
  type SubscriptionResponse,
} from '../../../util/billing';

/**
 * The B7 screen. It answers three questions a rep or finance user actually has
 * about a recurring line: what is billed next and when, what a mid-cycle change
 * would cost, and what happens if the customer cancels.
 */
export default function SubscriptionPanel({ orderId }: { orderId: string }) {
  const { hasRole } = useAuth();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<SubscriptionLine | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');

  const canBill = hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE');

  useEffect(() => {
    const controller = new AbortController();

    fetchSubscriptionForOrder(orderId, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load the subscription.'));
      });

    return () => controller.abort();
  }, [orderId]);

  const run = useCallback(async (action: () => Promise<SubscriptionResponse>) => {
    setBusy(true);
    setError('');

    try {
      setData(await action());
    } catch (err) {
      setError(getApiErrorMessage(err, 'That billing action failed.'));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!data) {
    return null;
  }

  const { subscription, recurringTotal } = data;

  // A pure one-time order has no recurring half, and no panel.
  if (!subscription) {
    return null;
  }

  const activeLines = subscription.lines.filter((line) => line.status === 'ACTIVE');

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <Repeat size={15} className="text-brand-500" />
            Subscription &amp; billing
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            The recurring half of this order, billed on its own schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SUBSCRIPTION_TONE[subscription.status]}>
            {humanStatus(subscription.status)}
          </Badge>
          {canBill && activeLines.length > 0 && (
            <>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');

                  try {
                    const result = await runRecurringBilling({ subscriptionId: subscription.id });
                    setNotice(result.message);
                    setData(await fetchSubscriptionForOrder(orderId));
                  } catch (err) {
                    setError(getApiErrorMessage(err, 'The billing run failed.'));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Run billing
              </Button>
              <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
                Cancel subscription
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {notice && (
        <p className="mx-5 mt-4 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-700">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Per period" value={currency.format(recurringTotal)} />
          <Stat
            label="Next billing"
            value={new Date(subscription.nextBillingDate).toLocaleDateString()}
          />
          <Stat label="Active lines" value={String(activeLines.length)} />
          <Stat
            label="Started"
            value={new Date(subscription.startDate).toLocaleDateString()}
          />
        </div>

        {subscription.lines.map((line) => {
          const upcoming = line.billingSchedules
            .filter((schedule) => schedule.status !== 'CANCELLED')
            .slice(0, 4);

          return (
            <div key={line.id} className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">{line.product.name}</p>
                  <p className="text-[12px] text-slate-400">
                    {line.product.sku} · {line.quantity} × {currency.format(line.unitPrice)}
                    {line.discountPercent > 0 ? ` less ${line.discountPercent}%` : ''} ·{' '}
                    {planCadence(line.subscriptionPlan)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={SUBSCRIPTION_TONE[line.status]}>{humanStatus(line.status)}</Badge>
                  {canBill && line.status === 'ACTIVE' && (
                    <Button variant="secondary" onClick={() => setChanging(line)} disabled={busy}>
                      Change quantity
                    </Button>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  <CalendarClock size={13} />
                  Upcoming billing
                </p>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-1.5 font-semibold">Period</th>
                      <th className="py-1.5 text-center font-semibold">Qty</th>
                      <th className="py-1.5 text-right font-semibold">Amount</th>
                      <th className="py-1.5 text-right font-semibold">Proration</th>
                      <th className="py-1.5 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {upcoming.map((schedule) => (
                      <tr key={schedule.id}>
                        <td className="py-2 text-[13px] text-slate-700">
                          {new Date(schedule.periodStart).toLocaleDateString()} –{' '}
                          {new Date(schedule.periodEnd).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-center text-[13px] text-slate-600">
                          {schedule.quantity}
                        </td>
                        <td className="py-2 text-right text-[13px] text-slate-700">
                          {currency.format(schedule.amount)}
                        </td>
                        <td className="py-2 text-right text-[13px]">
                          {schedule.prorationAmount === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span
                              className={
                                schedule.prorationAmount > 0
                                  ? 'font-medium text-amber-700'
                                  : 'font-medium text-emerald-700'
                              }
                            >
                              {schedule.prorationAmount > 0 ? '+' : ''}
                              {currency.format(schedule.prorationAmount)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Badge tone={SCHEDULE_TONE[schedule.status]}>
                            {humanStatus(schedule.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {subscription.prorationEvents.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Mid-cycle adjustments
            </h3>
            <ul className="flex flex-col gap-2">
              {subscription.prorationEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    {event.prorationAmount >= 0 ? (
                      <TrendingUp size={15} className="mt-px shrink-0 text-amber-500" />
                    ) : (
                      <TrendingDown size={15} className="mt-px shrink-0 text-emerald-500" />
                    )}
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">
                        {humanStatus(event.eventType)}
                        {event.oldQuantity !== null && event.newQuantity !== null
                          ? `: ${event.oldQuantity} → ${event.newQuantity}`
                          : ''}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(event.effectiveAt).toLocaleDateString()} · unused{' '}
                        {currency.format(event.unusedPeriodAmount)} · new{' '}
                        {currency.format(event.newPeriodAmount)}
                        {event.reason ? ` · ${event.reason}` : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[14px] font-semibold ${
                      event.prorationAmount >= 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {event.prorationAmount > 0 ? '+' : ''}
                    {currency.format(event.prorationAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[12px] text-slate-400">
          Invoices raised for these periods appear under{' '}
          <Link to="/app/invoices" className="text-brand-600 no-underline hover:underline">
            Invoices
          </Link>
          .
        </p>
      </div>

      {changing && (
        <ChangeQuantityDialog
          line={changing}
          onClose={() => setChanging(null)}
          onSubmit={async (quantity, reason) => {
            setChanging(null);
            await run(() =>
              changeSubscriptionQuantity(subscription.id, changing.id, { quantity, reason }),
            );
          }}
        />
      )}

      {cancelling && (
        <CancelSubscriptionDialog
          onClose={() => setCancelling(false)}
          onSubmit={async (atPeriodEnd, reason) => {
            setCancelling(false);
            setBusy(true);
            setError('');

            try {
              const result: CancelResponse = await cancelSubscription(subscription.id, {
                atPeriodEnd,
                reason,
              });

              setData(result);
              setNotice(
                result.creditNote
                  ? `Cancelled. Credit note ${result.creditNote.creditNoteNumber} issued for ${currency.format(result.creditNote.amount)}.`
                  : atPeriodEnd
                    ? 'Cancelled at period end — no refund is due.'
                    : 'Cancelled. No invoice was found to credit.',
              );
            } catch (err) {
              setError(getApiErrorMessage(err, 'The cancellation failed.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Card>
  );
}

function ChangeQuantityDialog({
  line,
  onClose,
  onSubmit,
}: {
  line: SubscriptionLine;
  onClose: () => void;
  onSubmit: (quantity: number, reason?: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Declared inline so the "must actually differ" rule can see the current
  // line — applying a change to the same number would only raise an empty
  // proration event.
  const { errors, validateField, validateAll, clearError } = useValidation({
    quantity: [
      required('A quantity'),
      numeric({ min: 1, max: 1_000_000, integer: true, label: 'The quantity' }),
      (value: string) =>
        Number(value) === line.quantity ? 'That is already the current quantity.' : null,
    ],
    reason: [maxLength(400, 'A reason')],
  });

  const next = Number(quantity);
  const periodEnd = new Date(line.currentPeriodEnd);
  const periodStart = new Date(line.currentPeriodStart);
  const now = Date.now();

  // The same maths the server runs, so the rep sees the charge before agreeing
  // to it rather than discovering it on the next invoice.
  const remaining = Math.min(
    1,
    Math.max(0, (periodEnd.getTime() - now) / (periodEnd.getTime() - periodStart.getTime())),
  );
  const perUnit = line.unitPrice * (1 - line.discountPercent / 100);
  const estimate =
    Number.isFinite(next) && next > 0
      ? (next - line.quantity) * perUnit * (line.subscriptionPlan.prorationEnabled ? remaining : 0)
      : 0;

  return (
    <Modal title={`Change quantity — ${line.product.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          The customer keeps the period they have already paid for, so only the remaining{' '}
          {Math.round(remaining * 100)}% of it is repriced. Future periods bill at the new
          quantity.
        </p>

        <TextField
          id="sub-quantity"
          label="New quantity"
          type="number"
          min={1}
          step={1}
          value={quantity}
          error={errors.quantity}
          onChange={(e) => {
            clearError('quantity');
            setQuantity(e.target.value);
          }}
          onBlur={() => validateField('quantity', quantity)}
          hint={`Currently ${line.quantity}`}
        />

        <div className="rounded-xl bg-slate-50 px-3.5 py-3">
          <p className="text-[12px] uppercase tracking-wide text-slate-400">
            Estimated proration
          </p>
          <p
            className={`font-display text-[20px] font-bold ${
              estimate >= 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {estimate > 0 ? '+' : ''}
            {currency.format(estimate)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {estimate >= 0 ? 'Charged on the next invoice' : 'Credited on the next invoice'}
          </p>
        </div>

        <TextAreaField
          id="sub-reason"
          label="Reason"
          rows={2}
          maxLength={400}
          value={reason}
          error={errors.reason}
          onChange={(e) => {
            clearError('reason');
            setReason(e.target.value);
          }}
          onBlur={() => validateField('reason', reason)}
          placeholder="Why is the quantity changing?"
          hint="Optional. It is recorded on the proration event."
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              if (!validateAll({ quantity, reason })) return;

              setBusy(true);
              onSubmit(next, reason.trim() || undefined);
            }}
          >
            Apply change
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CancelSubscriptionDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (atPeriodEnd: boolean, reason: string) => void;
}) {
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // `cancelSubscriptionSchema` requires the reason and caps it at 400.
  const { errors, validateField, validateAll, clearError } = useValidation<'reason'>({
    reason: [required('A reason'), maxLength(400, 'A reason')],
  });

  return (
    <Modal title="Cancel subscription" onClose={onClose} width="lg">
      <div className="flex flex-col gap-4 p-5">
        <fieldset className="flex flex-col gap-2 border-none p-0">
          <legend className="mb-1 text-[13px] font-medium text-slate-700">When</legend>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5">
            <input
              type="radio"
              name="cancel-when"
              checked={atPeriodEnd}
              onChange={() => setAtPeriodEnd(true)}
              className="mt-1"
            />
            <span>
              <span className="block text-[13px] font-medium text-slate-800">At period end</span>
              <span className="block text-[12px] text-slate-500">
                Service runs to the end of the period already paid for. Nothing is refunded.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5">
            <input
              type="radio"
              name="cancel-when"
              checked={!atPeriodEnd}
              onChange={() => setAtPeriodEnd(false)}
              className="mt-1"
            />
            <span>
              <span className="block text-[13px] font-medium text-slate-800">Immediately</span>
              <span className="block text-[12px] text-slate-500">
                The unused part of the current period is credited back on a credit note.
              </span>
            </span>
          </label>
        </fieldset>

        <TextAreaField
          id="cancel-sub-reason"
          label="Reason"
          rows={3}
          maxLength={400}
          value={reason}
          error={errors.reason}
          onChange={(e) => {
            clearError('reason');
            setReason(e.target.value);
          }}
          onBlur={() => validateField('reason', reason)}
          placeholder="Why is the customer cancelling?"
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              if (!validateAll({ reason })) return;

              setBusy(true);
              onSubmit(atPeriodEnd, reason.trim());
            }}
          >
            Cancel subscription
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-display text-[17px] font-bold text-slate-900">{value}</p>
    </div>
  );
}
