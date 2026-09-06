import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, ArchiveRestore, Pencil } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import axios from 'axios';
import { SALES_WRITE_ROLES, getApiErrorMessage } from '../../../util/api';
import {
  fetchCustomer,
  fetchCustomerTiers,
  tierTone,
  updateCustomer,
  type CustomerDetail as Customer,
  type CustomerHistory,
  type CustomerTier,
} from '../../../util/customers';
import { useAuth } from '../../../hooks/useAuth';
import PortalAccessPanel from './PortalAccessPanel';
import CustomerFormModal from './CustomerFormModal';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canArchive = hasRole('ADMIN', 'SALES_MANAGER');
  const canWrite = hasRole(...SALES_WRITE_ROLES);
  // Issuing portal access is the same right as editing the account.
  const canInvite = canWrite;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return;

      fetchCustomer(id, signal)
        .then((result) => {
          setCustomer(result.customer);
          setHistory(result.history);
          setError('');
        })
        .catch((err) => {
          // An aborted request is this effect's own cleanup, not a failure.
          if (axios.isCancel(err)) return;

          setError(getApiErrorMessage(err, 'Could not load this customer.'));
        });
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    fetchCustomerTiers(controller.signal)
      .then(setTiers)
      .catch(() => {
        /* editing still works without the tier list */
      });

    return () => controller.abort();
  }, [load]);

  async function toggleArchived() {
    if (!customer) return;

    setArchiving(true);

    try {
      await updateCustomer(customer.id, { isActive: !customer.isActive });
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update this customer.'));
    } finally {
      setArchiving(false);
    }
  }

  if (error && !customer) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!customer || !history) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={customer.name}
        subtitle={`${customer.customerCode}${customer.email ? ` · ${customer.email}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil size={15} />
                Edit
              </Button>
            )}
            {canArchive && (
              <Button variant="secondary" onClick={toggleArchived} loading={archiving}>
                {customer.isActive ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                {customer.isActive ? 'Archive' : 'Restore'}
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => navigate('/app/quotations')}>New quotation</Button>
            )}
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tierTone(customer.customerTier?.name)}>
          {customer.customerTier?.name ?? 'Unassigned'} tier
        </Badge>
        {customer.customerTier?.defaultDiscountCeiling !== null &&
          customer.customerTier?.defaultDiscountCeiling !== undefined && (
            <Badge>Discount ceiling {customer.customerTier.defaultDiscountCeiling}%</Badge>
          )}
        {customer.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Archived</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Quotations" value={String(history.quotationCount)} />
        <Stat label="Open quote value" value={currency.format(history.openQuotationValue)} />
        <Stat label="Orders" value={String(history.orderCount)} />
        <Stat label="Order value" value={currency.format(history.orderValue)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
            Account details
          </h2>
          <dl className="flex flex-col gap-4 p-5">
            <Detail label="Phone" value={customer.phone} />
            <Detail label="Billing address" value={customer.billingAddress} />
            <Detail label="Shipping address" value={customer.shippingAddress} />
            <Detail
              label="Owner"
              value={
                customer.createdBy
                  ? `${customer.createdBy.firstName} ${customer.createdBy.lastName}`
                  : null
              }
            />
            <Detail label="Created" value={new Date(customer.createdAt).toLocaleDateString()} />
          </dl>
        </Card>

        {/* Portal logins are issued from here — a customer cannot self-register. */}
        {canInvite && (
          <div className="lg:col-span-2">
            <PortalAccessPanel customerId={customer.id} />
          </div>
        )}

        <Card className="lg:col-span-2">
          <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
            Deal history
          </h2>

          {history.recentQuotations.length === 0 && history.recentOrders.length === 0 ? (
            <EmptyState
              title="No deals yet"
              description="Quotations and orders for this account will appear here as they are raised."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.recentQuotations.map((quote) => (
                <li key={quote.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-slate-900">{quote.quoteNumber}</p>
                    <p className="text-[12px] text-slate-400">
                      Quotation · {quote.status} · {new Date(quote.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold text-slate-900">
                    {currency.format(quote.grandTotal)}
                  </span>
                </li>
              ))}
              {history.recentOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-slate-900">{order.orderNumber}</p>
                    <p className="text-[12px] text-slate-400">
                      Order · {order.status} · {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold text-slate-900">
                    {currency.format(order.grandTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <CustomerFormModal
          tiers={tiers}
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/customers"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      All customers
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 font-display text-[24px] font-bold leading-none tracking-tight text-slate-900">
        {value}
      </p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-[14px] text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
