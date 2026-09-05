import { useCallback, useEffect, useState } from 'react';
import { Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Badge, Button, Card, ErrorBanner, Spinner } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import {
  SUGGESTION_LABELS,
  acceptSuggestion,
  dismissSuggestion,
  fetchSuggestions,
  type QuotationResponse,
  type Suggestion,
} from '../../../util/quotations';

/**
 * The upsell panel that sits beside the cart. Every figure comes from the real
 * pricing and risk engines run with the suggestion appended, so "what happens
 * if I add this" is answered exactly rather than estimated.
 */
export default function RecommendationsPanel({
  quotationId,
  editable,
  /** Bumped by the parent after any cart change so suggestions re-rank. */
  refreshKey,
  onAccepted,
}: {
  quotationId: string;
  editable: boolean;
  refreshKey: number;
  onAccepted: (result: QuotationResponse) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);

      fetchSuggestions(quotationId, signal)
        .then((result) => {
          setSuggestions(result.suggestions);
          setLoading(false);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(getApiErrorMessage(err, 'Could not load suggestions.'));
          setLoading(false);
        });
    },
    [quotationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load, refreshKey]);

  async function handleAccept(suggestion: Suggestion) {
    setBusyId(suggestion.productId);
    setError('');

    try {
      onAccepted(await acceptSuggestion(quotationId, suggestion.productId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not add that product.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(suggestion: Suggestion) {
    setBusyId(suggestion.productId);
    setError('');

    try {
      const result = await dismissSuggestion(quotationId, suggestion.productId);
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not dismiss that suggestion.'));
    } finally {
      setBusyId(null);
    }
  }

  if (!loading && suggestions.length === 0 && !error) {
    return null;
  }

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Sparkles size={16} className="text-brand-600" />
        <h2 className="text-[15px] font-semibold text-slate-900">Suggested add-ons</h2>
      </div>

      <div className="flex flex-col gap-3 p-5">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <Spinner />
        ) : (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.productId}
              suggestion={suggestion}
              editable={editable}
              busy={busyId === suggestion.productId}
              disabled={busyId !== null}
              onAccept={() => handleAccept(suggestion)}
              onDismiss={() => handleDismiss(suggestion)}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function SuggestionCard({
  suggestion,
  editable,
  busy,
  disabled,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  editable: boolean;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const marginDelta = suggestion.orderMarginDeltaPercent;
  const helpsMargin = marginDelta !== null && marginDelta > 0;
  const lowersRisk = suggestion.riskScoreDelta < 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-900">{suggestion.name}</p>
          <p className="text-[12px] text-slate-400">
            {suggestion.sku} · {suggestion.categoryName}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={disabled}
            aria-label={`Dismiss ${suggestion.sku}`}
            className="cursor-pointer border-none bg-transparent p-1 text-slate-300 transition-colors hover:text-slate-600 disabled:cursor-not-allowed"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">
          {SUGGESTION_LABELS[suggestion.suggestionType] ?? suggestion.suggestionType}
        </Badge>
        {suggestion.promotion && (
          <Badge tone="amber">
            {suggestion.promotion.name} · {suggestion.promotion.discountValue}% off
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <Figure label="Adds revenue" value={currency.format(suggestion.revenueDelta)} />
        <Figure
          label="Adds margin"
          value={
            suggestion.marginDelta === null
              ? '—'
              : `${currency.format(suggestion.marginDelta)}${
                  suggestion.marginPercent === null ? '' : ` · ${suggestion.marginPercent}%`
                }`
          }
        />
      </dl>

      {(marginDelta !== null || lowersRisk) && (
        <div className="flex flex-wrap gap-2 text-[11px] font-medium">
          {marginDelta !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                helpsMargin ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {helpsMargin ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {helpsMargin ? '+' : ''}
              {marginDelta} pts order margin
            </span>
          )}
          {lowersRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              <TrendingDown size={12} />
              risk {suggestion.riskScoreDelta} → {suggestion.riskScoreAfter}
            </span>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Paired with {suggestion.becauseOf.join(', ')}
      </p>

      {editable && (
        <Button variant="secondary" onClick={onAccept} loading={busy} disabled={disabled}>
          Add to quote — {currency.format(suggestion.unitPrice)}
        </Button>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
