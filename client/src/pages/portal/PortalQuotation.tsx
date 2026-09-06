import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquare, Repeat, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
  TextField,
} from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { currency } from '../../util/catalog';
import { planCadence } from '../../util/orders';
import {
  confirmFromPortal,
  fetchPortalQuotation,
  postChangeRequest,
  postComment,
  postCounterOffer,
  stateTone,
  type PortalLine,
  type PortalResponse,
} from '../../util/portal';

/**
 * The B8 negotiation screen.
 *
 * Everything a customer can do here is a *request*: a question, a change, or a
 * counter-discount. None of it edits the quotation — the seller applies it, so
 * discount governance is never routed around from this side.
 */
export default function PortalQuotation() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PortalResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const [askingAbout, setAskingAbout] = useState<PortalLine | null>(null);
  const [changingLine, setChangingLine] = useState<PortalLine | null>(null);
  const [countering, setCountering] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchPortalQuotation(id, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this quotation.'));
      });

    return () => controller.abort();
  }, [id]);

  async function run(action: () => Promise<PortalResponse>) {
    setBusy(true);
    setError('');

    try {
      setData(await action());
    } catch (err) {
      setError(getApiErrorMessage(err, 'That could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!data || !id) {
    return <Spinner />;
  }

  const { quotation, state, canNegotiate, canConfirm } = data;
  const openRequests = quotation.changeRequests.filter((entry) => entry.status === 'PENDING');
  const openOffer = quotation.counterOffers.find((entry) => entry.status === 'PENDING');

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={quotation.quoteNumber}
        subtitle={`Prepared for ${quotation.customer.name} by ${quotation.contact}`}
        action={
          canConfirm ? (
            <Button onClick={() => setConfirming(true)} loading={busy}>
              <CheckCircle2 size={15} />
              Confirm quotation
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={stateTone(state.label)}>{state.label}</Badge>
        {quotation.validUntil && (
          <Badge>valid to {new Date(quotation.validUntil).toLocaleDateString()}</Badge>
        )}
        <span className="text-[13px] text-slate-500">{state.detail}</span>
      </div>

      {error && <ErrorBanner message={error} />}

      {confirmed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          Thank you — your order <strong>{confirmed}</strong> has been created and your account
          manager has been notified.
        </div>
      )}

      {openOffer && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-800">
          Your proposal of <strong>{openOffer.discountPercent}%</strong> (
          {currency.format(openOffer.totalAmount)}) is with the team.
        </div>
      )}

      <Card>
        <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
          What is included
        </h2>
        <div className="divide-y divide-slate-100">
          {quotation.lines.map((line) => {
            const comments = quotation.lineComments.filter(
              (comment) => comment.quoteLineId === line.id,
            );
            const request = openRequests.find((entry) => entry.quoteLineId === line.id);

            return (
              <div key={line.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">
                      {line.product.name}
                      {line.subscriptionPlan && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                          <Repeat size={10} />
                          {planCadence(line.subscriptionPlan)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">
                      {line.product.category.name} · {line.quantity} {line.product.unit}
                      {line.quantity === 1 ? '' : 's'} × {currency.format(line.unitPrice)}
                      {line.discountPercent > 0 ? ` · ${line.discountPercent}% off` : ''}
                    </p>
                    {line.product.description && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                        {line.product.description}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-[15px] font-semibold text-slate-900">
                      {currency.format(line.lineTotal)}
                    </p>
                    {line.subscriptionPlan && (
                      <p className="text-[11px] text-slate-400">per period</p>
                    )}
                  </div>
                </div>

                {request && (
                  <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    You asked for a change here: {request.message}
                  </p>
                )}

                {comments.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {comments.map((comment) => (
                      <li
                        key={comment.id}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600"
                      >
                        <span className="font-medium text-slate-800">
                          {comment.user.firstName}:
                        </span>{' '}
                        {comment.comment}
                      </li>
                    ))}
                  </ul>
                )}

                {canNegotiate && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAskingAbout(line)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <MessageSquare size={13} />
                      Ask about this
                    </button>
                    <button
                      type="button"
                      onClick={() => setChangingLine(line)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      Request a change
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <dl className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <Row label="Subtotal" value={currency.format(quotation.subtotal)} />
          <Row label="Discount" value={`− ${currency.format(quotation.discountTotal)}`} />
          <Row label="Tax" value={currency.format(quotation.taxTotal)} />
          <div className="border-t border-slate-200 pt-2.5">
            <Row label="Total" value={currency.format(quotation.grandTotal)} strong />
          </div>
        </dl>
      </Card>

      {canNegotiate && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                Need a different price?
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-400">
                Propose the discount that would work for you and we will come back to you.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setCountering(true)} disabled={busy}>
              Propose a discount
            </Button>
          </div>
        </Card>
      )}

      {askingAbout && (
        <PromptDialog
          title={`Ask about ${askingAbout.product.name}`}
          label="Your question"
          placeholder="What would you like to know?"
          submitLabel="Send question"
          onClose={() => setAskingAbout(null)}
          onSubmit={async (text) => {
            const line = askingAbout;
            setAskingAbout(null);
            await run(() => postComment(id, { quoteLineId: line.id, comment: text }));
          }}
        />
      )}

      {changingLine && (
        <ChangeRequestDialog
          line={changingLine}
          onClose={() => setChangingLine(null)}
          onSubmit={async (quantity, message) => {
            const line = changingLine;
            setChangingLine(null);
            await run(() =>
              postChangeRequest(id, {
                quoteLineId: line.id,
                requestType: quantity === undefined ? 'OTHER' : 'QUANTITY',
                requestedQuantity: quantity,
                message,
              }),
            );
          }}
        />
      )}

      {countering && (
        <CounterOfferDialog
          currentTotal={quotation.grandTotal}
          onClose={() => setCountering(false)}
          onSubmit={async (discountPercent, message) => {
            setCountering(false);
            await run(() => postCounterOffer(id, { discountPercent, message }));
          }}
        />
      )}

      {confirming && (
        <PromptDialog
          title={`Confirm ${quotation.quoteNumber}`}
          label="Anything to add? (optional)"
          placeholder="A note for your account manager"
          submitLabel="Confirm these terms"
          optional
          description={`This accepts the quotation at ${currency.format(quotation.grandTotal)} and creates your order.`}
          onClose={() => setConfirming(false)}
          onSubmit={async (text) => {
            setConfirming(false);
            setBusy(true);
            setError('');

            try {
              const result = await confirmFromPortal(id, text || undefined);
              setConfirmed(result.orderNumber);
              setData(await fetchPortalQuotation(id));
            } catch (err) {
              setError(getApiErrorMessage(err, 'This quotation could not be confirmed.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function PromptDialog({
  title,
  label,
  placeholder,
  submitLabel,
  description,
  optional,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  description?: string;
  optional?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        {description && (
          <p className="text-[13px] leading-relaxed text-slate-500">{description}</p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prompt-text" className="text-[13px] font-medium text-slate-700">
            {label}
          </label>
          <textarea
            id="prompt-text"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!optional && text.trim().length === 0}
            onClick={() => {
              setBusy(true);
              onSubmit(text.trim());
            }}
          >
            <Send size={15} />
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChangeRequestDialog({
  line,
  onClose,
  onSubmit,
}: {
  line: PortalLine;
  onClose: () => void;
  onSubmit: (quantity: number | undefined, message: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const next = Number(quantity);
  const changed = Number.isFinite(next) && next > 0 && next !== line.quantity;

  return (
    <Modal title={`Request a change — ${line.product.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          id="request-quantity"
          label="Quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={`Currently ${line.quantity}. Leave as-is if the change is something else.`}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="request-message" className="text-[13px] font-medium text-slate-700">
            What would you like changed?
          </label>
          <textarea
            id="request-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what you need"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={message.trim().length === 0}
            onClick={() => {
              setBusy(true);
              onSubmit(changed ? next : undefined, message.trim());
            }}
          >
            Send request
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CounterOfferDialog({
  currentTotal,
  onClose,
  onSubmit,
}: {
  currentTotal: number;
  onClose: () => void;
  onSubmit: (discountPercent: number, message?: string) => void;
}) {
  const [discount, setDiscount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const value = Number(discount);
  const valid = Number.isFinite(value) && value >= 0 && value <= 100;

  return (
    <Modal title="Propose a discount" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Current total is {currency.format(currentTotal)}. Tell us the discount that would let
          you sign, and your account manager will respond.
        </p>

        <TextField
          id="counter-discount"
          label="Discount you need (%)"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="counter-message" className="text-[13px] font-medium text-slate-700">
            Why (optional)
          </label>
          <textarea
            id="counter-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Budget, competing quote, volume commitment…"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!valid || discount === ''}
            onClick={() => {
              setBusy(true);
              onSubmit(value, message.trim() || undefined);
            }}
          >
            Send proposal
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BackLink() {
  return (
    <Link
      to="/portal/quotations"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      Your quotations
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'text-[14px] font-semibold text-slate-900' : 'text-[13px] text-slate-500'}>
        {label}
      </dt>
      <dd
        className={
          strong ? 'font-display text-[20px] font-bold text-slate-900' : 'text-[14px] text-slate-700'
        }
      >
        {value}
      </dd>
    </div>
  );
}
