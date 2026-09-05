import { useEffect, useState } from 'react';
import { AlertCircle, FileText, Loader2, ShoppingCart, TrendingUp, Users, Wallet } from 'lucide-react';
import { api, getApiErrorMessage } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';

type DashboardSummary = {
  scope: 'own' | 'team';
  counts: {
    customers: number;
    quotations: number;
    openQuotations: number;
    pendingApprovals: number;
    orders: number;
  };
  totals: {
    pipelineValue: number;
    wonRevenue: number;
  };
  recentQuotations: {
    id: string;
    quoteNumber: string;
    status: string;
    approvalStatus: string;
    grandTotal: number;
    currencyCode: string;
    updatedAt: string;
    customer: { id: string; name: string };
  }[];
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    api
      .get<DashboardSummary>('/dashboard/summary')
      .then(({ data }) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Could not load your dashboard.'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
        <AlertCircle size={16} className="mt-px shrink-0 text-red-500" />
        {error}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const { counts, totals } = summary;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-slate-900">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-[14px] text-slate-500">
          {summary.scope === 'team'
            ? 'Showing the whole team’s book of business.'
            : 'Showing the deals you own.'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Wallet} label="Pipeline value" value={currency.format(totals.pipelineValue)} />
        <StatCard icon={TrendingUp} label="Won revenue" value={currency.format(totals.wonRevenue)} />
        <StatCard icon={FileText} label="Open quotations" value={String(counts.openQuotations)} hint={`${counts.quotations} total`} />
        <StatCard icon={ShoppingCart} label="Orders" value={String(counts.orders)} />
        <StatCard icon={Users} label="Active customers" value={String(counts.customers)} />
        <StatCard icon={AlertCircle} label="Awaiting approval" value={String(counts.pendingApprovals)} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
          Recent quotations
        </h2>

        {summary.recentQuotations.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-slate-400">
            No quotations yet — start one from the Quotations screen.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.recentQuotations.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-slate-900">{quote.customer.name}</p>
                  <p className="text-[12px] text-slate-400">
                    {quote.quoteNumber} · {quote.status}
                  </p>
                </div>
                <span className="shrink-0 text-[14px] font-semibold text-slate-900">
                  {currency.format(quote.grandTotal)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={16} />
        <span className="text-[12px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 font-display text-[28px] font-bold leading-none tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-slate-400">{hint}</p>}
    </div>
  );
}
