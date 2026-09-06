import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquare, Send, X } from 'lucide-react';
import { Badge, Button, Card, ErrorBanner, Spinner } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import {
  fetchNegotiation,
  postReply,
  resolveChangeRequest,
  resolveCounterOffer,
  type NegotiationThread,
} from '../../../util/negotiation';
import { firstError, maxLength, required } from '../../../util/validation';

/** Mirrors `lineCommentSchema`: something has to be said, and not more than 2000. */
const REPLY_RULES = [required('A reply'), maxLength(2000, 'A reply')];

/**
 * The seller's side of the portal conversation.
 *
 * Accepting a counter-discount here does not write a special "negotiated" price
 * — it runs the ordinary order-discount path, so the quote is repriced,
 * re-scored and re-routed for approval exactly as if the rep had typed the
 * number themselves.
 */
export default function NegotiationPanel({
  quotationId,
  refreshKey,
  onQuotationChanged,
}: {
  quotationId: string;
  refreshKey: number;
  onQuotationChanged: () => void;
}) {
  const [thread, setThread] = useState<NegotiationThread | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchNegotiation(quotationId, signal)
        .then((result) => {
          setThread(result);
          setUnavailable(false);
        })
        .catch(() => {
          if (signal?.aborted) return;
          // A draft has no thread yet; that is not an error worth showing.
          setUnavailable(true);
        });
    },
    [quotationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load, refreshKey]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');

    try {
      await action();
      load();
      onQuotationChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, 'That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  if (unavailable) {
    return null;
  }

  if (!thread) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const nothingYet =
    thread.changeRequests.length === 0 &&
    thread.comments.length === 0 &&
    thread.counterOffers.length === 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <MessageSquare size={15} className="text-slate-400" />
            Customer negotiation
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            What the customer has asked for in the portal.
          </p>
        </div>
        {thread.pendingCount > 0 && (
          <Badge tone="amber">{thread.pendingCount} waiting</Badge>
        )}
      </div>

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="flex flex-col gap-4 p-5">
        {nothingYet && (
          <p className="text-[13px] text-slate-400">
            The customer has not raised anything yet.
          </p>
        )}

        {thread.counterOffers.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Counter-offers
            </h3>
            <ul className="flex flex-col gap-2">
              {thread.counterOffers.map((offer) => (
                <li
                  key={offer.id}
                  className="rounded-xl border border-slate-200 px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">
                        {offer.discountPercent}% on the whole order →{' '}
                        {currency.format(offer.totalAmount)}
                      </p>
                      {offer.message && (
                        <p className="mt-0.5 text-[12px] text-slate-500">{offer.message}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {offer.createdBy.firstName} {offer.createdBy.lastName} ·{' '}
                        {new Date(offer.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {offer.status === 'PENDING' ? (
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveCounterOffer(quotationId, offer.id, {
                                accept: false,
                                reason: 'We are unable to meet that discount.',
                              }),
                            )
                          }
                        >
                          <X size={14} />
                          Decline
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveCounterOffer(quotationId, offer.id, { accept: true }),
                            )
                          }
                        >
                          <Check size={14} />
                          Accept
                        </Button>
                      </div>
                    ) : (
                      <Badge tone={offer.status === 'ACCEPTED' ? 'green' : 'red'}>
                        {humanStatus(offer.status)}
                      </Badge>
                    )}
                  </div>
                  {offer.status === 'PENDING' && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                      Accepting reprices every line and may push the quote back into approval.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {thread.changeRequests.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Change requests
            </h3>
            <ul className="flex flex-col gap-2">
              {thread.changeRequests.map((request) => (
                <li key={request.id} className="rounded-xl border border-slate-200 px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">
                        {humanStatus(request.requestType)}
                        {request.quoteLine ? ` · ${request.quoteLine.product.sku}` : ''}
                        {request.newValue?.quantity !== undefined
                          ? ` → ${request.newValue.quantity}`
                          : ''}
                      </p>
                      {request.message && (
                        <p className="mt-0.5 text-[12px] text-slate-500">{request.message}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {request.requestedBy.firstName} {request.requestedBy.lastName} ·{' '}
                        {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {request.status === 'PENDING' ? (
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveChangeRequest(quotationId, request.id, {
                                accept: false,
                                reason: 'We cannot accommodate that change.',
                              }),
                            )
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              resolveChangeRequest(quotationId, request.id, { accept: true }),
                            )
                          }
                        >
                          Accept
                        </Button>
                      </div>
                    ) : (
                      <Badge tone={request.status === 'ACCEPTED' ? 'green' : 'red'}>
                        {humanStatus(request.status)}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {thread.comments.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Conversation
            </h3>
            <ul className="flex flex-col gap-2">
              {thread.comments.map((comment) => (
                <li
                  key={comment.id}
                  className={`rounded-xl px-3.5 py-2.5 text-[12px] ${
                    comment.fromCustomer
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-brand-50 text-brand-900'
                  }`}
                >
                  <span className="font-semibold">
                    {comment.fromCustomer
                      ? `${comment.user.firstName} (customer)`
                      : comment.user.firstName}
                    :
                  </span>{' '}
                  {comment.comment}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            rows={3}
            onChange={(e) => {
              setDraftError('');
              setDraft(e.target.value);
            }}
            onBlur={() => setDraftError(firstError(draft, REPLY_RULES) ?? '')}
            maxLength={2000}
            aria-invalid={draftError ? true : undefined}
            aria-describedby={draftError ? 'negotiation-reply-error' : undefined}
            placeholder="Reply to the customer…"
            aria-label="Reply to the customer"
            className={`w-full resize-y rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-slate-400 ${
              draftError
                ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                : 'border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const invalid = firstError(draft, REPLY_RULES);
                if (invalid) {
                  setDraftError(invalid);
                  return;
                }
                setDraftError('');
                run(async () => {
                  await postReply(quotationId, { comment: draft.trim() });
                  setDraft('');
                });
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {draft.length > 0 ? `${draft.length}/2000 · Ctrl+Enter to send` : 'Up to 2000 characters'}
            </span>
            <Button
              disabled={busy}
              onClick={() => {
                const invalid = firstError(draft, REPLY_RULES);

                if (invalid) {
                  setDraftError(invalid);
                  return;
                }

                setDraftError('');
                run(async () => {
                  await postReply(quotationId, { comment: draft.trim() });
                  setDraft('');
                });
              }}
            >
              <Send size={14} />
              Send reply
            </Button>
          </div>
          {draftError && (
            <p
              id="negotiation-reply-error"
              role="alert"
              className="text-[12px] font-medium text-red-600"
            >
              {draftError}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
