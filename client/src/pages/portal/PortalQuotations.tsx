import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { currency } from '../../util/catalog';
import {
  fetchPortalQuotations,
  stateTone,
  type PortalQuotationSummary,
} from '../../util/portal';

export default function PortalQuotations() {
  const [quotations, setQuotations] = useState<PortalQuotationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetchPortalQuotations(controller.signal)
      .then((result) => {
        setQuotations(result.data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load your quotations.'));
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your quotations"
        subtitle="Review the terms, ask questions, or propose changes — no email needed."
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner />
      ) : quotations.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing waiting for you"
            description="When your account manager sends a quotation it will appear here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {quotations.map((quote) => (
            <Link
              key={quote.id}
              to={`/portal/quotations/${quote.id}`}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 no-underline transition-colors hover:border-brand-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-slate-900">{quote.quoteNumber}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {quote.customer.name} · {quote._count.lines} item
                    {quote._count.lines === 1 ? '' : 's'}
                    {quote.validUntil
                      ? ` · valid to ${new Date(quote.validUntil).toLocaleDateString()}`
                      : ''}
                  </p>
                  <p className="mt-1.5 text-[12px] text-slate-400">{quote.state.detail}</p>
                </div>

                <div className="text-right">
                  <p className="font-display text-[20px] font-bold text-slate-900">
                    {currency.format(quote.grandTotal)}
                  </p>
                  <div className="mt-1.5">
                    <Badge tone={stateTone(quote.state.label)}>{quote.state.label}</Badge>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
