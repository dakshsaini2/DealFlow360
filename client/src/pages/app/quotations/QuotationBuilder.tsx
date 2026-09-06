import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Repeat, Send, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
  TextField,
} from '../../../components/ui';
import { SALES_WRITE_ROLES, getApiErrorMessage } from '../../../util/api';
import { useAuth } from '../../../hooks/useAuth';
import { currency, marginTone } from '../../../util/catalog';
import { tierTone } from '../../../util/customers';
import {
  APPROVAL_TONE,
  STATUS_TONE,
  addQuoteLine,
  applyOrderDiscount,
  fetchQuotation,
  humanStatus,
  removeQuoteLine,
  sendQuotation,
  updateQuoteLine,
  type QuotationResponse,
  type QuoteLine,
} from '../../../util/quotations';
import { confirmQuotation } from '../../../util/orders';
import AddLineModal from './AddLineModal';
import ApprovalPanel from './ApprovalPanel';
import NegotiationPanel from './NegotiationPanel';
import RecommendationsPanel from './RecommendationsPanel';
import RiskPanel from './RiskPanel';

export default function QuotationBuilder() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<QuotationResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState('');
  // Any cart change re-ranks the suggestions, since what is already in the
  // cart both seeds and filters them.
  const [cartVersion, setCartVersion] = useState(0);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchQuotation(id, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this quotation.'));
      });

    return () => controller.abort();
  }, [id]);

  /** Every mutation returns the whole recalculated quote, so state stays in sync. */
  const run = useCallback(async (action: () => Promise<QuotationResponse>) => {
    setBusy(true);
    setError('');

    try {
      setData(await action());
      setCartVersion((current) => current + 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'That change could not be saved.'));
    } finally {
      setBusy(false);
    }
  }, []);

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

  const { quotation, risk } = data;
  // Editing needs both an open status and a role the server will accept —
  // Finance can read a quote and approve it, but not rewrite its lines.
  const canWrite = hasRole(...SALES_WRITE_ROLES);
  const editable =
    canWrite && ['DRAFT', 'SENT', 'UNDER_NEGOTIATION'].includes(quotation.status);

  // Confirmation is the quote-to-order handover. The server enforces this same
  // rule; mirroring it here just keeps the button from offering a dead click.
  const awaitingApproval = quotation.approvalStatus === 'PENDING';
  const approvalBlocked = ['PENDING', 'REJECTED', 'RETURNED'].includes(quotation.approvalStatus);
  const confirmable =
    canWrite &&
    ['SENT', 'UNDER_NEGOTIATION'].includes(quotation.status) &&
    !approvalBlocked &&
    quotation.lines.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={quotation.quoteNumber}
        subtitle={`${quotation.customer.name} · ${quotation.customer.customerCode} · version ${quotation.versionNumber}`}
        action={
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button variant="secondary" onClick={() => setPicking(true)} disabled={busy}>
                <Plus size={15} />
                Add product
              </Button>
            )}
            {canWrite && quotation.status === 'DRAFT' && (
              <Button
                onClick={() => run(() => sendQuotation(id))}
                loading={busy}
                disabled={quotation.lines.length === 0}
              >
                <Send size={15} />
                Send to customer
              </Button>
            )}
            {confirmable && (
              <Button onClick={() => setConfirming(true)} loading={busy}>
                <CheckCircle2 size={15} />
                Confirm order
              </Button>
            )}
            {awaitingApproval && (
              <span
                title="Approval has to clear before this quote can become an order"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[14px] font-semibold text-slate-400"
              >
                <CheckCircle2 size={15} />
                Awaiting approval
              </span>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[quotation.status]}>{humanStatus(quotation.status)}</Badge>
        <Badge tone={APPROVAL_TONE[quotation.approvalStatus]}>
          approval: {humanStatus(quotation.approvalStatus)}
        </Badge>
        <Badge tone={tierTone(quotation.customer.customerTier?.name)}>
          {quotation.customer.customerTier?.name ?? 'No tier'}
        </Badge>
        {quotation.validUntil && (
          <Badge>valid to {new Date(quotation.validUntil).toLocaleDateString()}</Badge>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="text-[15px] font-semibold text-slate-900">Lines</h2>
              {editable && quotation.lines.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="order-discount" className="text-[12px] text-slate-500">
                    Discount all lines
                  </label>
                  <input
                    id="order-discount"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    placeholder="%"
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-[13px] outline-none focus:border-brand-500"
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || orderDiscount === ''}
                    onClick={() => run(() => applyOrderDiscount(id, Number(orderDiscount)))}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {quotation.lines.length === 0 ? (
              <EmptyState
                title="No lines yet"
                description="Add a product to start pricing this deal."
                action={<Button onClick={() => setPicking(true)}>Add product</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-3 py-3 font-semibold">Billing</th>
                      <th className="px-3 py-3 text-center font-semibold">Qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Unit</th>
                      <th className="px-3 py-3 text-center font-semibold">Disc %</th>
                      <th className="px-3 py-3 text-center font-semibold">Ceiling</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 text-right font-semibold">Margin</th>
                      {editable && <th className="px-3 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quotation.lines.map((line) => (
                      <LineRow
                        key={line.id}
                        line={line}
                        editable={editable}
                        busy={busy}
                        onChange={(input) => run(() => updateQuoteLine(id, line.id, input))}
                        onRemove={() => run(() => removeQuoteLine(id, line.id))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Totals
            </h2>
            <dl className="flex flex-col gap-2.5 p-5">
              <Total label="Subtotal" value={currency.format(quotation.subtotal)} />
              <Total label="Discount" value={`− ${currency.format(quotation.discountTotal)}`} />
              <Total label="Tax" value={currency.format(quotation.taxTotal)} />
              <div className="border-t border-slate-100 pt-2.5">
                <Total label="Grand total" value={currency.format(quotation.grandTotal)} strong />
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <RiskPanel risk={risk} approvalRequired={quotation.approvalRequired} />

          <ApprovalPanel
            quotationId={id}
            refreshKey={cartVersion}
            onDecided={() => {
              // A decision changes the quotation's approval status, so pull
              // the whole record again rather than patching it locally.
              fetchQuotation(id).then(setData).catch(() => undefined);
            }}
          />

          {/* Renders nothing on a draft, which has no thread yet. */}
          <NegotiationPanel
            quotationId={id}
            refreshKey={cartVersion}
            onQuotationChanged={() => {
              // Accepting a concession reprices the quote and can re-open
              // approval, so pull the whole record again.
              fetchQuotation(id).then(setData).catch(() => undefined);
            }}
          />

          <RecommendationsPanel
            quotationId={id}
            editable={editable}
            refreshKey={cartVersion}
            onAccepted={(result) => {
              setData(result);
              setCartVersion((current) => current + 1);
            }}
          />

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Customer
            </h2>
            <dl className="flex flex-col gap-3 p-5 text-[13px]">
              <Detail label="Account" value={quotation.customer.name} />
              <Detail label="Email" value={quotation.customer.email} />
              <Detail
                label="Tier ceiling"
                value={
                  quotation.customer.customerTier?.defaultDiscountCeiling === null ||
                  quotation.customer.customerTier?.defaultDiscountCeiling === undefined
                    ? null
                    : `${quotation.customer.customerTier.defaultDiscountCeiling}% default`
                }
              />
              <Detail label="Price list" value={quotation.priceList?.name ?? 'list price'} />
              <Detail
                label="Owner"
                value={`${quotation.salesRep.firstName} ${quotation.salesRep.lastName}`}
              />
            </dl>
          </Card>
        </div>
      </div>

      {picking && (
        <AddLineModal
          onClose={() => setPicking(false)}
          onPick={async (product, quantity) => {
            setData(await addQuoteLine(id, { productId: product.id, quantity }));
            setCartVersion((current) => current + 1);
          }}
        />
      )}

      {confirming && (
        <ConfirmOrderDialog
          quoteNumber={quotation.quoteNumber}
          total={quotation.grandTotal}
          onClose={() => setConfirming(false)}
          onConfirm={async (promisedDeliveryDate) => {
            setBusy(true);
            setError('');

            try {
              const result = await confirmQuotation(id, { promisedDeliveryDate });
              navigate(`/app/orders/${result.order.id}`);
            } catch (err) {
              setError(getApiErrorMessage(err, 'This quotation could not be confirmed.'));
              setConfirming(false);
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Capturing the promised delivery date here is what later lets the deal-health
 * dashboard measure slippage — there is no other point in the flow where the
 * commitment is made explicit.
 */
function ConfirmOrderDialog({
  quoteNumber,
  total,
  onClose,
  onConfirm,
}: {
  quoteNumber: string;
  total: number;
  onClose: () => void;
  onConfirm: (promisedDeliveryDate?: string) => void;
}) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`Confirm ${quoteNumber}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          This creates a sales order for {currency.format(total)} and closes the quotation. One-time
          and recurring lines are split onto their own billing tracks.
        </p>
        <TextField
          id="promised-date"
          label="Promised delivery date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint="Optional. Delivery slippage is measured against this date."
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              onConfirm(date ? new Date(date).toISOString() : undefined);
            }}
          >
            <CheckCircle2 size={15} />
            Create order
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LineRow({
  line,
  editable,
  busy,
  onChange,
  onRemove,
}: {
  line: QuoteLine;
  editable: boolean;
  busy: boolean;
  onChange: (input: {
    quantity?: number;
    discountPercent?: number;
    subscriptionPlanId?: string | null;
  }) => void;
  onRemove: () => void;
}) {
  // Local copies so typing stays responsive; the server is called on blur.
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [discount, setDiscount] = useState(String(line.discountPercent));

  useEffect(() => setQuantity(String(line.quantity)), [line.quantity]);
  useEffect(() => setDiscount(String(line.discountPercent)), [line.discountPercent]);

  const over = (line.discountExcessPercent ?? 0) > 0;
  const cellInput =
    'w-16 rounded-lg border px-2 py-1.5 text-center text-[13px] outline-none focus:border-brand-500 disabled:bg-slate-50';

  return (
    <tr className={over ? 'bg-amber-50/40' : undefined}>
      <td className="px-5 py-3">
        <p className="text-[14px] font-medium text-slate-900">{line.product.name}</p>
        <p className="text-[12px] text-slate-400">
          {line.product.sku} · {line.product.category.name}
        </p>
      </td>
      <td className="px-3 py-3">
        <BillingCell line={line} editable={editable} busy={busy} onChange={onChange} />
      </td>
      <td className="px-3 py-3 text-center">
        {editable ? (
          <input
            type="number"
            min={1}
            aria-label={`Quantity for ${line.product.sku}`}
            value={quantity}
            disabled={busy}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={() => {
              const next = Number(quantity);
              if (next > 0 && next !== line.quantity) onChange({ quantity: next });
              else setQuantity(String(line.quantity));
            }}
            className={`${cellInput} border-slate-200`}
          />
        ) : (
          <span className="text-[13px] text-slate-700">{line.quantity}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-[13px] text-slate-700">
        {currency.format(line.unitPrice)}
      </td>
      <td className="px-3 py-3 text-center">
        {editable ? (
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            aria-label={`Discount for ${line.product.sku}`}
            value={discount}
            disabled={busy}
            onChange={(e) => setDiscount(e.target.value)}
            onBlur={() => {
              const next = Number(discount);
              if (next >= 0 && next <= 100 && next !== line.discountPercent) {
                onChange({ discountPercent: next });
              } else if (next !== line.discountPercent) {
                setDiscount(String(line.discountPercent));
              }
            }}
            className={`${cellInput} ${over ? 'border-amber-400 bg-amber-50 font-semibold text-amber-800' : 'border-slate-200'}`}
          />
        ) : (
          <span className="text-[13px] text-slate-700">{line.discountPercent}%</span>
        )}
      </td>
      <td className="px-3 py-3 text-center text-[13px]">
        <span className={over ? 'font-semibold text-amber-700' : 'text-slate-400'}>
          {line.allowedDiscountPercent ?? '—'}%
        </span>
        {over && (
          <span className="block text-[11px] font-semibold text-amber-700">
            +{line.discountExcessPercent} over
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-[14px] font-medium text-slate-900">
        {currency.format(line.lineTotal)}
      </td>
      <td className="px-3 py-3 text-right">
        {line.marginPercent === null ? (
          <span className="text-[13px] text-slate-400">—</span>
        ) : (
          <Badge tone={marginTone(line.marginPercent)}>{line.marginPercent}%</Badge>
        )}
      </td>
      {editable && (
        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove ${line.product.sku}`}
            className="cursor-pointer border-none bg-transparent p-1.5 text-slate-300 transition-colors hover:text-red-500 disabled:cursor-not-allowed"
          >
            <Trash2 size={15} />
          </button>
        </td>
      )}
    </tr>
  );
}

/**
 * A product that has recurring plans attached can be sold either way, so the
 * choice belongs on the line, not on the product. Picking a plan here is what
 * makes the line `RECURRING` when the order is created — this is the control
 * behind hybrid billing.
 */
function BillingCell({
  line,
  editable,
  busy,
  onChange,
}: {
  line: QuoteLine;
  editable: boolean;
  busy: boolean;
  onChange: (input: { subscriptionPlanId?: string | null }) => void;
}) {
  const plans = line.product.productSubscriptionPlans.map((entry) => entry.subscriptionPlan);

  if (plans.length === 0) {
    return <span className="text-[12px] text-slate-400">one-time</span>;
  }

  if (!editable) {
    return line.subscriptionPlan ? (
      <Badge tone="brand">
        <Repeat size={11} className="mr-1" />
        {line.subscriptionPlan.name}
      </Badge>
    ) : (
      <span className="text-[12px] text-slate-400">one-time</span>
    );
  }

  return (
    <select
      value={line.subscriptionPlanId ?? ''}
      disabled={busy}
      aria-label={`Billing for ${line.product.sku}`}
      onChange={(e) => onChange({ subscriptionPlanId: e.target.value || null })}
      className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[12px] outline-none focus:border-brand-500 disabled:bg-slate-50 ${
        line.subscriptionPlanId
          ? 'border-brand-200 bg-brand-50 font-semibold text-brand-700'
          : 'border-slate-200 text-slate-500'
      }`}
    >
      <option value="">One-time</option>
      {plans.map((plan) => (
        <option key={plan.id} value={plan.id}>
          {plan.name}
        </option>
      ))}
    </select>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/quotations"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      All quotations
    </Link>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
