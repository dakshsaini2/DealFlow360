import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, BellRing, Clock, Percent, Truck, X } from 'lucide-react';
import axios from 'axios';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
  TextAreaField,
} from '../../../components/ui';
import { firstError, maxLength } from '../../../util/validation';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import { useAuth } from '../../../hooks/useAuth';
import {
  ALERT_LABELS,
  HEALTH_TONE,
  SEVERITY_TONE,
  actOnAlert,
  fetchHealthDashboard,
  type AlertType,
  type AnomalyAlert,
  type HealthDashboard,
} from '../../../util/health';

const ALERT_ICONS: Record<AlertType, typeof Clock> = {
  STALLED: Clock,
  DISCOUNT_ANOMALY: Percent,
  DELIVERY_SLIPPAGE: Truck,
  MARGIN_EROSION: AlertTriangle,
};

/**
 * The B9 dashboard. Every alert links straight through to the deal it is about,
 * because an alert a manager cannot act on from where they are reading it is
 * just a notification.
 */
export default function DealHealth() {
  const { hasRole } = useAuth();
  const [data, setData] = useState<HealthDashboard | null>(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [alertType, setAlertType] = useState<AlertType | ''>('');
  const [acting, setActing] = useState<{ alert: AnomalyAlert; action: 'NUDGE' | 'ESCALATE' } | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const canAct = hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE');

  const load = useCallback(
    (signal: AbortSignal) => {
      fetchHealthDashboard({ scope, alertType: alertType || undefined }, signal)
        .then((result) => {
          setData(result);
          setError('');
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load the deal health dashboard.'));
        });
    },
    [scope, alertType, reloadKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  async function dismiss(alert: AnomalyAlert) {
    try {
      await actOnAlert(alert.id, { action: 'DISMISS' });
      setReloadKey((current) => current + 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'That alert could not be dismissed.'));
    }
  }

  if (!data && !error) {
    return <Spinner />;
  }

  const selectClasses =
    'cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deal health"
        subtitle={
          data
            ? `Stalled after ${data.thresholds.stalledDays} days · discount flagged past ${data.thresholds.anomalyMultiplier}× a rep's average`
            : undefined
        }
      />

      {error && <ErrorBanner message={error} />}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
          {notice}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Stalled deals"
              value={data.counts.stalled}
              icon={Clock}
              tone={data.counts.stalled > 0 ? 'amber' : 'neutral'}
            />
            <Stat
              label="Discount anomalies"
              value={data.counts.discountAnomalies}
              icon={Percent}
              tone={data.counts.discountAnomalies > 0 ? 'amber' : 'neutral'}
            />
            <Stat
              label="Delivery slippage"
              value={data.counts.deliverySlippage}
              icon={Truck}
              tone={data.counts.deliverySlippage > 0 ? 'red' : 'neutral'}
            />
            <Stat
              label="Deals at risk"
              value={data.counts.atRisk}
              icon={AlertTriangle}
              tone={data.counts.atRisk > 0 ? 'red' : 'neutral'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as AlertType | '')}
              aria-label="Filter by alert type"
              className={selectClasses}
            >
              <option value="">All alerts</option>
              <option value="STALLED">Stalled</option>
              <option value="DISCOUNT_ANOMALY">Discount anomaly</option>
              <option value="DELIVERY_SLIPPAGE">Delivery slippage</option>
            </select>

            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'all' | 'mine')}
              aria-label="Scope"
              className={selectClasses}
            >
              <option value="all">Everyone</option>
              <option value="mine">Mine</option>
            </select>
          </div>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Open alerts
            </h2>

            {data.alerts.length === 0 ? (
              <EmptyState
                title="Nothing needs attention"
                description="No stalled deals, discount anomalies or late deliveries right now."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.alerts.map((alert) => {
                  const Icon = ALERT_ICONS[alert.alertType] ?? AlertTriangle;

                  return (
                    <li key={alert.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                                ? 'bg-red-50 text-red-500'
                                : 'bg-amber-50 text-amber-500'
                            }`}
                          >
                            <Icon size={16} />
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/app/quotations/${alert.quotation.id}`}
                                className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                              >
                                {alert.title}
                              </Link>
                              <Badge tone={SEVERITY_TONE[alert.severity]}>
                                {alert.severity.toLowerCase()}
                              </Badge>
                              <Badge>{ALERT_LABELS[alert.alertType]}</Badge>
                            </div>
                            {alert.description && (
                              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                                {alert.description}
                              </p>
                            )}
                            <p className="mt-1 text-[11px] text-slate-400">
                              {alert.quotation.customer.name} ·{' '}
                              {currency.format(alert.quotation.grandTotal)} ·{' '}
                              {alert.quotation.salesRep.firstName}{' '}
                              {alert.quotation.salesRep.lastName}
                            </p>
                          </div>
                        </div>

                        {canAct && (
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            <Button
                              variant="secondary"
                              onClick={() => setActing({ alert, action: 'NUDGE' })}
                            >
                              <BellRing size={14} />
                              Nudge
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setActing({ alert, action: 'ESCALATE' })}
                            >
                              <ArrowUpRight size={14} />
                              Escalate
                            </Button>
                            <button
                              type="button"
                              onClick={() => dismiss(alert)}
                              aria-label={`Dismiss ${alert.title}`}
                              className="cursor-pointer rounded-lg border-none bg-transparent p-2 text-slate-300 hover:text-slate-600"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Deal health scores
            </h2>

            {data.dealHealth.length === 0 ? (
              <EmptyState title="No open deals to score" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3 font-semibold">Quote</th>
                      <th className="px-3 py-3 font-semibold">Customer</th>
                      <th className="px-3 py-3 text-center font-semibold">Health</th>
                      <th className="px-3 py-3 text-center font-semibold">Idle</th>
                      <th className="px-3 py-3 text-center font-semibold">Discount</th>
                      <th className="px-3 py-3 text-center font-semibold">Fulfilment</th>
                      <th className="px-5 py-3 text-center font-semibold">Billing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.dealHealth.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <Link
                            to={`/app/quotations/${row.quotation.id}`}
                            className="text-[13px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                          >
                            {row.quotation.quoteNumber}
                          </Link>
                          <p className="text-[11px] text-slate-400">
                            {humanStatus(row.quotation.status)} ·{' '}
                            {currency.format(row.quotation.grandTotal)}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-[13px] text-slate-600">
                          {row.quotation.customer.name}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge tone={HEALTH_TONE[row.healthStatus]}>
                            {row.healthScore}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center text-[13px] text-slate-600">
                          {row.daysInactive}d
                        </td>
                        <RiskCell value={row.discountRiskScore} />
                        <RiskCell value={row.fulfillmentRiskScore} />
                        <RiskCell value={row.billingRiskScore} last />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {acting && (
        <ActDialog
          alert={acting.alert}
          action={acting.action}
          onClose={() => setActing(null)}
          onSubmit={async (note) => {
            const target = acting;
            setActing(null);

            try {
              await actOnAlert(target.alert.id, { action: target.action, note });
              setNotice(
                `${target.action === 'NUDGE' ? 'Nudge' : 'Escalation'} posted to ${target.alert.quotation.quoteNumber}.`,
              );
              setReloadKey((current) => current + 1);
            } catch (err) {
              setError(getApiErrorMessage(err, 'That action failed.'));
            }
          }}
        />
      )}
    </div>
  );
}

function ActDialog({
  alert,
  action,
  onClose,
  onSubmit,
}: {
  alert: AnomalyAlert;
  action: 'NUDGE' | 'ESCALATE';
  onClose: () => void;
  onSubmit: (note?: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title={`${action === 'NUDGE' ? 'Nudge' : 'Escalate'} — ${alert.quotation.quoteNumber}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          {action === 'NUDGE'
            ? `A note goes onto the quotation thread for ${alert.quotation.salesRep.firstName}, and this alert closes.`
            : `The deal is escalated to management and a note is posted on the quotation thread. This alert closes.`}
        </p>
        <TextAreaField
          id="alert-note"
          label="Note (optional)"
          rows={3}
          maxLength={1000}
          value={note}
          error={firstError(note, [maxLength(1000, 'The note')]) ?? undefined}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should happen next?"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={note.length > 1000}
            onClick={() => {
              if (note.length > 1000) return;
              setBusy(true);
              onSubmit(note.trim() || undefined);
            }}
          >
            {action === 'NUDGE' ? 'Send nudge' : 'Escalate'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RiskCell({ value, last }: { value: number; last?: boolean }) {
  return (
    <td className={`${last ? 'px-5' : 'px-3'} py-3 text-center text-[13px]`}>
      {value === 0 ? (
        <span className="text-slate-300">—</span>
      ) : (
        <span className={value >= 60 ? 'font-semibold text-red-600' : 'text-amber-600'}>
          {value}
        </span>
      )}
    </td>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone: 'neutral' | 'amber' | 'red';
}) {
  const tones = {
    neutral: 'text-slate-400',
    amber: 'text-amber-500',
    red: 'text-red-500',
  } as const;

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className={tones[tone]} />
        <p className="text-[12px] uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-1 font-display text-[26px] font-bold text-slate-900">{value}</p>
    </Card>
  );
}
