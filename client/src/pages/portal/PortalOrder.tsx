import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Package, Receipt, Repeat, Truck } from 'lucide-react';
import { Badge, Card, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { currency } from '../../util/catalog';
import { planCadence } from '../../util/orders';
import { humanStatus } from '../../util/quotations';
import {
  deliveryTone,
  fetchPortalOrder,
  type PortalOrderLine,
  type PortalOrderResponse,
} from '../../util/portal';

/**
 * One order, from the buyer's side.
 *
 * Deliberately answers their questions in order: where is it, what did I buy,
 * what do I owe. The seller's operational detail — which warehouse, what the
 * split cost, the margin — is not in the payload at all.
 */
/** The delivery tone, as the icon's colours. */
const DELIVERY_ICON_TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-600',
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-500',
  neutral: 'bg-slate-100 text-slate-500',
};

export default function PortalOrder() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PortalOrderResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchPortalOrder(id, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this order.'));
      });

    return () => controller.abort();
  }, [id]);

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!data) {
    return <Spinner />;
  }

  const { order, delivery, billing } = data;
  const oneTime = order.lines.filter((line) => line.lineType === 'ONE_TIME');
  const recurring = order.lines.filter((line) => line.lineType === 'RECURRING');

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.customer.name} · placed ${new Date(
          order.confirmedAt ?? order.createdAt,
        ).toLocaleDateString()} · your contact is ${order.contact}`}
      />

      {/* Where is it — the first thing anyone opens this page for. */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                DELIVERY_ICON_TONES[deliveryTone(delivery.label)]
              }`}
            >
              <Truck size={18} />
            </span>
            <div>
              {/* The heading already names the state; a badge repeating it
                  would be noise, so the tone rides on the icon instead. */}
              <p className="text-[15px] font-semibold text-slate-900">{delivery.label}</p>
              <p className="mt-0.5 text-[13px] text-slate-500">{delivery.detail}</p>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-400">
                {order.promisedDeliveryDate && (
                  <span>
                    Promised {new Date(order.promisedDeliveryDate).toLocaleDateString()}
                  </span>
                )}
                {delivery.shippedAt && (
                  <span>Shipped {new Date(delivery.shippedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>

          {billing.totalDue > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Outstanding</p>
              <p className="font-display text-[20px] font-bold text-amber-600">
                {currency.format(billing.totalDue)}
              </p>
            </div>
          )}
        </div>

        {delivery.awaitingStock.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <Clock size={13} />
              Waiting on stock
            </p>
            <ul className="flex flex-col gap-1.5">
              {delivery.awaitingStock.map((item) => (
                <li
                  key={item.sku}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-2.5"
                >
                  <span className="text-[13px] text-slate-800">
                    {item.quantity} × {item.name}
                  </span>
                  <span className="text-[12px] text-amber-800">
                    {item.expectedRestockDate
                      ? `expected ${new Date(item.expectedRestockDate).toLocaleDateString()}`
                      : 'date to be confirmed'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {oneTime.length > 0 && (
            <LineTable
              title="Items"
              icon={<Package size={15} className="text-slate-400" />}
              lines={oneTime}
              total={billing.oneTimeTotal}
            />
          )}

          {recurring.length > 0 && (
            <LineTable
              title="Subscriptions"
              icon={<Repeat size={15} className="text-brand-500" />}
              lines={recurring}
              total={billing.recurringTotal}
              recurring
            />
          )}

          <Card>
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              <Receipt size={15} className="text-slate-400" />
              Invoices
            </h2>
            {order.invoices.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-slate-400">
                Nothing has been invoiced on this order yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {order.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">
                        {invoice.invoiceNumber}
                        <span className="ml-2 text-[11px] font-normal text-slate-400">
                          {invoice.invoiceType === 'RECURRING' ? 'subscription' : 'one-time'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        issued {new Date(invoice.issuedAt).toLocaleDateString()}
                        {invoice.dueAt
                          ? ` · due ${new Date(invoice.dueAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          invoice.status === 'PAID'
                            ? 'green'
                            : invoice.status === 'OVERDUE'
                              ? 'red'
                              : invoice.status === 'PARTIALLY_PAID'
                                ? 'amber'
                                : 'brand'
                        }
                      >
                        {humanStatus(invoice.status)}
                      </Badge>
                      <p className="text-[14px] font-semibold text-slate-900">
                        {currency.format(invoice.grandTotal)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Order total
            </h2>
            <dl className="flex flex-col gap-2.5 p-5">
              <Row label="Subtotal" value={currency.format(order.subtotal)} />
              <Row label="Discount" value={`− ${currency.format(order.discountTotal)}`} />
              <Row label="Tax" value={currency.format(order.taxTotal)} />
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Total" value={currency.format(order.grandTotal)} strong />
              </div>
              {billing.totalDue > 0 && (
                <Row label="Still to pay" value={currency.format(billing.totalDue)} />
              )}
            </dl>
          </Card>

          {order.subscriptions.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Your subscription
              </h2>
              {order.subscriptions.map((subscription) => (
                <div key={subscription.id} className="flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-slate-500">Next billing</span>
                    <span className="text-[13px] font-medium text-slate-900">
                      {new Date(subscription.nextBillingDate).toLocaleDateString()}
                    </span>
                  </div>
                  {subscription.lines.map((line) => (
                    <p key={line.id} className="text-[12px] text-slate-400">
                      {line.quantity} × {line.product.name} · {line.subscriptionPlan.name}
                    </p>
                  ))}
                </div>
              ))}
            </Card>
          )}

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Delivering to
            </h2>
            <div className="p-5 text-[13px] leading-relaxed text-slate-600">
              <p className="font-medium text-slate-900">{order.customer.name}</p>
              <p className="mt-1 whitespace-pre-line">
                {order.customer.shippingAddress ??
                  order.customer.billingAddress ??
                  'No address on file'}
              </p>
            </div>
          </Card>

          {order.quotation && (
            <p className="text-[12px] text-slate-400">
              From quotation{' '}
              <Link
                to={`/portal/quotations/${order.quotation.id}`}
                className="text-brand-600 no-underline hover:underline"
              >
                {order.quotation.quoteNumber}
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LineTable({
  title,
  icon,
  lines,
  total,
  recurring,
}: {
  title: string;
  icon: React.ReactNode;
  lines: PortalOrderLine[];
  total: number;
  recurring?: boolean;
}) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
        {icon}
        {title}
      </h2>
      <ul className="divide-y divide-slate-100">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-slate-900">{line.product.name}</p>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {line.product.category.name} · {line.quantity} {line.product.unit}
                {line.quantity === 1 ? '' : 's'} × {currency.format(line.unitPrice)}
                {line.discountPercent > 0 ? ` · ${line.discountPercent}% off` : ''}
                {line.subscriptionPlan ? ` · ${planCadence(line.subscriptionPlan)}` : ''}
              </p>
            </div>
            <p className="text-[14px] font-semibold text-slate-900">
              {currency.format(line.lineTotal)}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <span className="text-[13px] text-slate-500">
          {recurring ? 'Per period' : 'Items subtotal'}
        </span>
        <span className="text-[14px] font-semibold text-slate-900">{currency.format(total)}</span>
      </div>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/portal/orders"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      Your orders
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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
