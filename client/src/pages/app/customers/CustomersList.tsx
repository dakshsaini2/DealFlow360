import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
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
import {
  fetchCustomerTiers,
  fetchCustomers,
  tierTone,
  type CustomerListParams,
  type CustomerSummary,
  type CustomerTier,
  type PageMeta,
} from '../../../util/customers';
import CustomerFormModal from './CustomerFormModal';

const SEARCH_DEBOUNCE_MS = 300;

export default function CustomersList() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [tierId, setTierId] = useState('');
  const [status, setStatus] = useState<CustomerListParams['status']>('active');
  const [page, setPage] = useState(1);

  // Debounce typing so a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();

    fetchCustomerTiers(controller.signal)
      .then(setTiers)
      .catch(() => {
        /* the filter just stays empty — not worth blocking the page for */
      });

    return () => controller.abort();
  }, []);

  const load = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);

      fetchCustomers(
        { q: query || undefined, tierId: tierId || undefined, status, page },
        signal,
      )
        .then((result) => {
          setCustomers(result.data);
          setMeta(result.meta);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load customers.'));
          setLoading(false);
        });
    },
    [query, tierId, status, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  function reload() {
    const controller = new AbortController();
    load(controller.signal);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        subtitle="Every account you can quote against, with its tier and discount ceiling."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            New customer
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
            placeholder="Search name, code or email…"
            aria-label="Search customers"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-800 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        <select
          value={tierId}
          onChange={(e) => {
            setTierId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by tier"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500"
        >
          <option value="">All tiers</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as CustomerListParams['status']);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500"
        >
          <option value="active">Active</option>
          <option value="inactive">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card>
        {loading ? (
          <Spinner />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers found"
            description={
              query || tierId || status !== 'active'
                ? 'Try clearing the filters above.'
                : 'Create your first account to start quoting.'
            }
            action={<Button onClick={() => setCreating(true)}>New customer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Tier</th>
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/app/customers/${customer.id}`}
                        className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {customer.name}
                      </Link>
                      <p className="text-[12px] text-slate-400">{customer.customerCode}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={tierTone(customer.customerTier?.name)}>
                        {customer.customerTier?.name ?? 'Unassigned'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">
                      {customer.email ?? '—'}
                      {customer.phone && <p className="text-[12px] text-slate-400">{customer.phone}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">
                      {customer.createdBy
                        ? `${customer.createdBy.firstName} ${customer.createdBy.lastName}`
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {customer.isActive ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="amber">Archived</Badge>
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
            Page {meta.page} of {meta.totalPages} · {meta.total} customers
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

      {creating && (
        <CustomerFormModal
          tiers={tiers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
