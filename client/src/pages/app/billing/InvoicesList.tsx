import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Search } from 'lucide-react';
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
import { useAuth } from '../../../hooks/useAuth';
import {
  INVOICE_TONE,
  fetchInvoices,
  runRecurringBilling,
  type InvoiceSummary,
} from '../../../util/billing';
import type { PageMeta } from '../../../util/customers';

const SEARCH_DEBOUNCE_MS = 300;

export default function InvoicesList() {
  const { hasRole } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [running, setRunning] = useState(false);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [invoiceType, setInvoiceType] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const canBill = hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE');

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

      fetchInvoices(
        {
          q: query || undefined,
          status: status || undefined,
          invoiceType: (invoiceType || undefined) as 'ONE_TIME' | 'RECURRING' | undefined,
          page,
        },
        signal,
      )
        .then((result) => {
          setInvoices(result.data);
          setMeta(result.meta);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load invoices.'));
          setLoading(false);
        });
    },
    [query, status, invoiceType, page, reloadKey],
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
        title="Invoices"
        subtitle="One-time sales and recurring periods, billed on separate tracks."
        action={
          canBill ? (
            <Button
              loading={running}
              onClick={async () => {
                setRunning(true);
                setError('');

                try {
                  const result = await runRecurringBilling();
                  setNotice(result.message);
                  setReloadKey((current) => current + 1);
                } catch (err) {
                  setError(getApiErrorMessage(err, 'The billing run failed.'));
                } finally {
                  setRunning(false);
                }
              }}
            >
              <Play size={15} />
              Run recurring billing
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number or customer…"
            aria-label="Search invoices"
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
          <option value="ISSUED">Issued</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="VOID">Void</option>
        </select>

        <select
          value={invoiceType}
          onChange={(e) => {
            setInvoiceType(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by type"
          className={selectClasses}
        >
          <option value="">Both types</option>
          <option value="ONE_TIME">One-time</option>
          <option value="RECURRING">Recurring</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
          {notice}
        </p>
      )}

      <Card>
        {loading ? (
          <Spinner />
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Confirming an order raises its one-time invoice; recurring periods are billed by the run."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 text-right font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/app/invoices/${invoice.id}`}
                        className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                      <p className="text-[12px] text-slate-400">
                        {invoice.order ? invoice.order.orderNumber : 'no order'} ·{' '}
                        {new Date(invoice.issuedAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-700">
                      {invoice.customer.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={invoice.invoiceType === 'RECURRING' ? 'brand' : 'neutral'}>
                        {invoice.invoiceType === 'RECURRING' ? 'recurring' : 'one-time'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={INVOICE_TONE[invoice.status]}>
                        {humanStatus(invoice.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-medium text-slate-900">
                      {currency.format(invoice.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[13px]">
                      {invoice.amountDue > 0 ? (
                        <span className="font-medium text-amber-700">
                          {currency.format(invoice.amountDue)}
                        </span>
                      ) : (
                        <span className="text-emerald-600">settled</span>
                      )}
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
            Page {meta.page} of {meta.totalPages} · {meta.total} invoices
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
