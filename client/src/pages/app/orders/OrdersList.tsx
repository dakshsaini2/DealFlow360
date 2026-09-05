import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import axios from 'axios';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import { ORDER_STATUS_TONE, fetchOrders, type OrderSummary } from '../../../util/orders';
import type { PageMeta } from '../../../util/customers';

const SEARCH_DEBOUNCE_MS = 300;

export default function OrdersList() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);

      fetchOrders({ q: query || undefined, status: status || undefined, scope, page }, signal)
        .then((result) => {
          setOrders(result.data);
          setMeta(result.meta);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load orders.'));
          setLoading(false);
        });
    },
    [query, status, scope, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  const selectClasses =
    'cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orders"
        subtitle="Confirmed deals, ready for fulfillment and billing."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer…"
            aria-label="Search orders"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className={selectClasses}
        >
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="ALLOCATED">Allocated</option>
          <option value="FULFILLED">Fulfilled</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as 'all' | 'mine');
            setPage(1);
          }}
          aria-label="Scope"
          className={selectClasses}
        >
          <option value="all">Everyone</option>
          <option value="mine">Mine</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card>
        {loading ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Confirm an approved quotation to create the first one."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">From quote</th>
                  <th className="px-5 py-3 font-semibold">Promised</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/app/orders/${order.id}`}
                        className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-[12px] text-slate-400">
                        {order._count.lines} line{order._count.lines === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-700">
                      {order.customer.name}
                      <p className="text-[12px] text-slate-400">
                        {order.customer.customerTier?.name ?? 'no tier'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>{humanStatus(order.status)}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[13px]">
                      {order.quotation ? (
                        <Link
                          to={`/app/quotations/${order.quotation.id}`}
                          className="text-slate-500 no-underline hover:text-brand-600"
                        >
                          {order.quotation.quoteNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-500">
                      {order.promisedDeliveryDate
                        ? new Date(order.promisedDeliveryDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-medium text-slate-900">
                      {currency.format(order.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
