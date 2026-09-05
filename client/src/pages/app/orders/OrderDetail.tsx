import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Repeat, ShoppingBag } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { tierTone } from '../../../util/customers';
import { humanStatus } from '../../../util/quotations';
import { useAuth } from '../../../hooks/useAuth';
import FulfillmentPanel from './FulfillmentPanel';
import SubscriptionPanel from './SubscriptionPanel';
import {
  ORDER_STATUS_TONE,
  cancelOrder,
  fetchOrder,
  planCadence,
  type OrderLine,
  type OrderResponse,
} from '../../../util/orders';

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const [data, setData] = useState<OrderResponse | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchOrder(id, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this order.'));
      });

    return () => controller.abort();
  }, [id]);

  // Allocating or shipping moves the order's own status, so the header has to
  // be pulled again rather than patched locally.
  const reload = useCallback(() => {
    if (!id) return;

    fetchOrder(id)
      .then(setData)
      .catch(() => undefined);
  }, [id]);

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!data || !id) {
    return <Spinner />;
  }

  const { order, billing } = data;
  const oneTimeLines = order.lines.filter((line) => line.lineType === 'ONE_TIME');
  const recurringLines = order.lines.filter((line) => line.lineType === 'RECURRING');
  const canCancel =
    hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE') &&
    order.status !== 'CANCELLED' &&
    order.status !== 'FULFILLED';

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.customer.name} · ${order.customer.customerCode}`}
        action={
          canCancel ? (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              Cancel order
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ORDER_STATUS_TONE[order.status]}>{humanStatus(order.status)}</Badge>
        <Badge tone={tierTone(order.customer.customerTier?.name)}>
          {order.customer.customerTier?.name ?? 'No tier'}
        </Badge>
        {billing.isHybrid && <Badge tone="brand">hybrid billing</Badge>}
        {order.promisedDeliveryDate && (
          <Badge>promised {new Date(order.promisedDeliveryDate).toLocaleDateString()}</Badge>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          {/*
            One-time and recurring lines are shown apart rather than in one
            table: they are billed by different engines and on different
            clocks, so a single running total would be misleading.
          */}
          {oneTimeLines.length > 0 && (
            <LineTable
              title="One-time lines"
              icon={<ShoppingBag size={15} className="text-slate-400" />}
              caption="Invoiced once, on fulfillment."
              lines={oneTimeLines}
              total={billing.oneTime.total}
            />
          )}

          {recurringLines.length > 0 && (
            <LineTable
              title="Recurring lines"
              icon={<Repeat size={15} className="text-brand-500" />}
              caption="Billed every period on their own schedule."
              lines={recurringLines}
              total={billing.recurring.total}
              recurring
            />
          )}

          <FulfillmentPanel orderId={id} onOrderChanged={reload} />

          {/* Renders nothing for a pure one-time order. */}
          <SubscriptionPanel orderId={id} />

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Order totals
            </h2>
            <dl className="flex flex-col gap-2.5 p-5">
              <Total label="Subtotal" value={currency.format(order.subtotal)} />
              <Total label="Discount" value={`− ${currency.format(order.discountTotal)}`} />
              <Total label="Tax" value={currency.format(order.taxTotal)} />
              <div className="border-t border-slate-100 pt-2.5">
                <Total label="Order value" value={currency.format(order.grandTotal)} strong />
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Billing split
            </h2>
            <div className="flex flex-col gap-4 p-5">
              <SplitRow
                label="One-time"
                count={billing.oneTime.lineCount}
                amount={billing.oneTime.total}
                note="invoiced once"
              />
              <SplitRow
                label="Recurring"
                count={billing.recurring.lineCount}
                amount={billing.recurring.total}
                note="per period, at current quantities"
              />
              {billing.isHybrid && (
                <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-brand-700">
                  This order mixes both types. They will be reconciled onto separate invoices so
                  the recurring schedule stays independent of the one-time sale.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Origin
            </h2>
            <dl className="flex flex-col gap-3 p-5 text-[13px]">
              <Detail
                label="Quotation"
                value={order.quotation?.quoteNumber ?? null}
                to={order.quotation ? `/app/quotations/${order.quotation.id}` : undefined}
              />
              <Detail
                label="Risk at confirm"
                value={
                  order.quotation?.blendedRiskScore === null ||
                  order.quotation?.blendedRiskScore === undefined
                    ? null
                    : String(order.quotation.blendedRiskScore)
                }
              />
              <Detail
                label="Approval"
                value={order.quotation ? humanStatus(order.quotation.approvalStatus) : null}
              />
              <Detail
                label="Confirmed"
                value={order.confirmedAt ? new Date(order.confirmedAt).toLocaleString() : null}
              />
              <Detail
                label="Owner"
                value={`${order.salesRep.firstName} ${order.salesRep.lastName}`}
              />
            </dl>
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Ship to
            </h2>
            <div className="p-5 text-[13px] leading-relaxed text-slate-600">
              <p className="font-medium text-slate-900">{order.customer.name}</p>
              <p className="mt-1 whitespace-pre-line">
                {order.customer.shippingAddress ?? order.customer.billingAddress ?? 'No address on file'}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {cancelling && (
        <CancelDialog
          orderNumber={order.orderNumber}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            try {
              setData(await cancelOrder(id, reason));
              setCancelling(false);
            } catch (err) {
              setError(getApiErrorMessage(err, 'Could not cancel this order.'));
              setCancelling(false);
            }
          }}
        />
      )}
    </div>
  );
}

function LineTable({
  title,
  icon,
  caption,
  lines,
  total,
  recurring,
}: {
  title: string;
  icon: React.ReactNode;
  caption: string;
  lines: OrderLine[];
  total: number;
  recurring?: boolean;
}) {
  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          {icon}
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] text-slate-400">{caption}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-semibold">Product</th>
              {recurring && <th className="px-3 py-3 font-semibold">Plan</th>}
              <th className="px-3 py-3 text-center font-semibold">Qty</th>
              <th className="px-3 py-3 text-right font-semibold">Unit</th>
              <th className="px-3 py-3 text-center font-semibold">Disc %</th>
              <th className="px-5 py-3 text-right font-semibold">
                {recurring ? 'Per period' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-5 py-3">
                  <p className="text-[14px] font-medium text-slate-900">{line.product.name}</p>
                  <p className="text-[12px] text-slate-400">
                    {line.product.sku} · {line.product.category.name}
                  </p>
                </td>
                {recurring && (
                  <td className="px-3 py-3 text-[13px]">
                    <Badge tone="brand">{line.subscriptionPlan?.name ?? '—'}</Badge>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {planCadence(line.subscriptionPlan)}
                    </p>
                  </td>
                )}
                <td className="px-3 py-3 text-center text-[13px] text-slate-700">{line.quantity}</td>
                <td className="px-3 py-3 text-right text-[13px] text-slate-700">
                  {currency.format(line.unitPrice)}
                </td>
                <td className="px-3 py-3 text-center text-[13px] text-slate-700">
                  {line.discountPercent}%
                </td>
                <td className="px-5 py-3 text-right text-[14px] font-medium text-slate-900">
                  {currency.format(line.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-100 bg-slate-50/60">
              <td colSpan={recurring ? 5 : 4} className="px-5 py-3 text-[13px] font-medium text-slate-500">
                {recurring ? 'Recurring subtotal, per period' : 'One-time subtotal'}
              </td>
              <td className="px-5 py-3 text-right text-[14px] font-semibold text-slate-900">
                {currency.format(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function CancelDialog({
  orderNumber,
  onClose,
  onConfirm,
}: {
  orderNumber: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`Cancel ${orderNumber}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Cancelling releases the order from fulfillment. The reason is written to the audit trail.
        </p>
        <label htmlFor="cancel-reason" className="text-[13px] font-medium text-slate-700">
          Reason
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this order being cancelled?"
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length === 0}
            onClick={() => {
              setBusy(true);
              onConfirm(reason.trim());
            }}
          >
            <RefreshCw size={15} />
            Cancel order
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SplitRow({
  label,
  count,
  amount,
  note,
}: {
  label: string;
  count: number;
  amount: number;
  note: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <p className="text-[13px] font-medium text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-400">
          {count} line{count === 1 ? '' : 's'} · {note}
        </p>
      </div>
      <p className="font-display text-[17px] font-bold text-slate-900">{currency.format(amount)}</p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/orders"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      All orders
    </Link>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'text-[14px] font-semibold text-slate-900' : 'text-[13px] text-slate-500'}>
        {label}
      </dt>
      <dd
        className={
          strong ? 'font-display text-[20px] font-bold text-slate-900' : 'text-[14px] text-slate-700'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Detail({ label, value, to }: { label: string; value: string | null; to?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right text-slate-700">
        {value === null ? (
          '—'
        ) : to ? (
          <Link to={to} className="text-brand-600 no-underline hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
