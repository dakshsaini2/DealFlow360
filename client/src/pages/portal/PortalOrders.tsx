import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { currency } from '../../util/catalog';
import {
  deliveryTone,
  fetchPortalOrders,
  type PortalOrderSummary,
} from '../../util/portal';
import type { PageMeta } from '../../util/customers';

/**
 * Everything this customer has bought.
 *
 * The two things they actually come here for are "where is it" and "what do I
 * still owe", so both lead — the order total is secondary to those.
 */
export default function PortalOrders() {
  const [orders, setOrders] = useState<PortalOrderSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetchPortalOrders(page, controller.signal)
      .then((result) => {
        setOrders(result.data);
        setMeta(result.meta);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load your orders.'));
        setLoading(false);
      });

    return () => controller.abort();
  }, [page]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your orders"
        subtitle="What you have bought, where it is, and anything still to pay."
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders yet"
            description="Once you confirm a quotation it will appear here."
            action={
              <Link to="/portal" className="no-underline">
                <Button>Browse products</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/portal/orders/${order.id}`}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 no-underline transition-colors hover:border-brand-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {order.customer.name} · {order._count.lines} item
                    {order._count.lines === 1 ? '' : 's'} ·{' '}
                    {new Date(order.confirmedAt ?? order.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1.5 text-[12px] text-slate-400">{order.delivery.detail}</p>
                </div>

                <div className="text-right">
                  <p className="font-display text-[20px] font-bold text-slate-900">
                    {currency.format(order.grandTotal)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                    <Badge tone={deliveryTone(order.delivery.label)}>
                      {order.delivery.label}
                    </Badge>
                    {order.amountDue > 0 ? (
                      <Badge tone="amber">{currency.format(order.amountDue)} due</Badge>
                    ) : (
                      <Badge tone="green">paid</Badge>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} orders
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={meta.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={meta.page >= meta.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
