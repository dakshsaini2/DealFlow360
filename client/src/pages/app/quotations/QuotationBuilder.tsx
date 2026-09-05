import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Send, Trash2 } from 'lucide-react';
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
import AddLineModal from './AddLineModal';
import RiskPanel from './RiskPanel';

export default function QuotationBuilder() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<QuotationResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState('');

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
  const editable = ['DRAFT', 'SENT', 'UNDER_NEGOTIATION'].includes(quotation.status);

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
            {quotation.status === 'DRAFT' && (
              <Button
                onClick={() => run(() => sendQuotation(id))}
                loading={busy}
                disabled={quotation.lines.length === 0}
              >
                <Send size={15} />
                Send to customer
              </Button>
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
          }}
        />
      )}
    </div>
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
  onChange: (input: { quantity?: number; discountPercent?: number }) => void;
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
