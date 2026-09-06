import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import axios from 'axios';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  SelectField,
  Spinner,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { fetchCustomers, type CustomerSummary } from '../../../util/customers';
import {
  APPROVAL_TONE,
  STATUS_TONE,
  createQuotation,
  fetchQuotations,
  humanStatus,
  riskBand,
  type QuotationSummary,
} from '../../../util/quotations';
import type { PageMeta } from '../../../util/customers';

const SEARCH_DEBOUNCE_MS = 300;

export default function QuotationsList() {
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
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

      fetchQuotations(
        {
          q: query || undefined,
          status: status || undefined,
          approvalStatus: approvalStatus || undefined,
          scope,
          page,
        },
        signal,
      )
        .then((result) => {
          setQuotations(result.data);
          setMeta(result.meta);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load quotations.'));
          setLoading(false);
        });
    },
    [query, status, approvalStatus, scope, page],
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
        title="Quotations"
        subtitle="Every deal in flight, with the risk score that decides whether it needs approval."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            New quotation
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote number or customer…"
            aria-label="Search quotations"
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
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="UNDER_NEGOTIATION">Under negotiation</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={approvalStatus}
          onChange={(e) => {
            setApprovalStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by approval"
          className={selectClasses}
        >
          <option value="">Any approval</option>
          <option value="NOT_REQUIRED">Not required</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
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
        ) : quotations.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            description="Create one to start building a deal."
            action={<Button onClick={() => setCreating(true)}>New quotation</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Quote</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Approval</th>
                  <th className="px-5 py-3 font-semibold">Risk</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((quote) => {
                  const band = riskBand(quote.blendedRiskScore ?? 0);

                  return (
                    <tr key={quote.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/app/quotations/${quote.id}`}
                          className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                        >
                          {quote.quoteNumber}
                        </Link>
                        <p className="text-[12px] text-slate-400">
                          {quote._count.lines} line{quote._count.lines === 1 ? '' : 's'} · v
                          {quote.versionNumber}
                        </p>
                        {/* A request the customer raised needs pricing, so it
                            is worth spotting in a list of the rep's own drafts. */}
                        {quote.source === 'PORTAL' && (
                          <span className="mt-1 inline-block">
                            <Badge tone="brand">customer request</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-700">
                        {quote.customer.name}
                        <p className="text-[12px] text-slate-400">
                          {quote.customer.customerTier?.name ?? 'no tier'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={STATUS_TONE[quote.status]}>{humanStatus(quote.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={APPROVAL_TONE[quote.approvalStatus]}>
                          {humanStatus(quote.approvalStatus)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={band.tone}>{quote.blendedRiskScore ?? 0}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right text-[14px] font-medium text-slate-900">
                        {currency.format(quote.grandTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} quotations
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

      {creating && <NewQuotationModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewQuotationModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchCustomers({ pageSize: 100, sort: 'name' }, controller.signal)
      .then((result) => {
        setCustomers(result.data);
        setCustomerId((current) => current || result.data[0]?.id || '');
      })
      .catch((err) => {
        // StrictMode mounts an effect twice in development, so the first
        // request is aborted by its own cleanup. That rejection is not a
        // failure worth showing — the second request is already in flight.
        if (axios.isCancel(err)) return;

        setError(getApiErrorMessage(err, 'Could not load customers.'));
      });

    return () => controller.abort();
  }, []);

  async function handleCreate() {
    if (!customerId) return;

    setSaving(true);
    setError('');

    try {
      const result = await createQuotation({ customerId });
      navigate(`/app/quotations/${result.quotation.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the quotation.'));
      setSaving(false);
    }
  }

  return (
    <Modal title="New quotation" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        {error && <ErrorBanner message={error} />}

        <SelectField
          id="new-quote-customer"
          label="Customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          disabled={saving}
          hint="Their tier sets the price list and the discount ceilings on every line."
        >
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} — {customer.customerTier?.name ?? 'no tier'}
            </option>
          ))}
        </SelectField>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={saving} disabled={!customerId}>
            Create draft
          </Button>
        </div>
      </div>
    </Modal>
  );
}
