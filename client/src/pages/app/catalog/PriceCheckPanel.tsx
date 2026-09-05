import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Badge, Card, ErrorBanner, SelectField, TextField } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { fetchCustomers, type CustomerSummary } from '../../../util/customers';
import {
  currency,
  marginTone,
  resolvePricing,
  type PricedLine,
  type ProductDetail,
} from '../../../util/catalog';

const DEBOUNCE_MS = 250;

/**
 * Runs one product through the real pricing engine for a chosen customer, so a
 * rep can see the resolved price, how far they may discount, and what margin
 * survives — the same call the quote builder will make per line.
 */
export default function PriceCheckPanel({ product }: { product: ProductDetail }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('0');
  const [line, setLine] = useState<PricedLine | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    fetchCustomers({ pageSize: 100, sort: 'name' }, controller.signal)
      .then((result) => {
        setCustomers(result.data);
        setCustomerId((current) => current || result.data[0]?.id || '');
      })
      .catch(() => setError('Could not load customers.'));

    return () => controller.abort();
  }, []);

  const request = useMemo(() => {
    const qty = Number(quantity);
    const disc = Number(discount);

    if (!customerId || !Number.isFinite(qty) || qty <= 0) return null;

    return {
      customerId,
      lines: [
        {
          productId: product.id,
          ...(variantId ? { variantId } : {}),
          quantity: qty,
          discountPercent: Number.isFinite(disc) ? Math.min(Math.max(disc, 0), 100) : 0,
        },
      ],
    };
  }, [customerId, product.id, variantId, quantity, discount]);

  useEffect(() => {
    if (!request) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      resolvePricing(request, controller.signal)
        .then((result) => {
          setLine(result.lines[0] ?? null);
          setError('');
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setError(getApiErrorMessage(err, 'Could not price this line.'));
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request]);

  return (
    <Card>
      <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
        Price check
      </h2>

      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] text-slate-500">
          Resolves this product against a customer’s tier price list and discount ceiling — the
          same engine the quote builder uses.
        </p>

        <SelectField
          id="price-check-customer"
          label="Customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} — {customer.customerTier?.name ?? 'no tier'}
            </option>
          ))}
        </SelectField>

        {product.variants.length > 0 && (
          <SelectField
            id="price-check-variant"
            label="Variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">Base product</option>
            {product.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </SelectField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <TextField
            id="price-check-qty"
            label="Quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField
            id="price-check-discount"
            label="Discount %"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>

        {error && <ErrorBanner message={error} />}

        {request && line && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Row label="List price" value={currency.format(line.listPrice)} />
            <Row
              label="Tier price"
              value={currency.format(line.unitPrice)}
              hint={line.priceSource === 'PRICE_LIST' ? line.priceListName ?? undefined : 'list price'}
            />
            <Row
              label="Discount ceiling"
              value={`${line.maxDiscountPercent}%`}
              hint={CEILING_LABELS[line.ceilingSource]}
            />
            <Row
              label="Price at ceiling"
              value={currency.format(line.ceilingUnitPrice)}
              hint={
                line.marginPercentAtCeiling === null
                  ? undefined
                  : `${line.marginPercentAtCeiling}% margin left`
              }
            />

            <div className="border-t border-slate-200 pt-3" />

            <Row label="Line total" value={currency.format(line.lineTotal)} strong />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate-500">Margin</span>
              {line.marginPercent === null ? (
                <span className="text-[13px] text-slate-400">unknown cost</span>
              ) : (
                <Badge tone={marginTone(line.marginPercent)}>
                  {currency.format(line.marginAmount ?? 0)} · {line.marginPercent}%
                </Badge>
              )}
            </div>

            {line.withinCeiling ? (
              <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-700">
                <Check size={15} />
                Within the {line.maxDiscountPercent}% ceiling — no approval needed for this line.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-[13px] font-medium text-amber-700">
                <AlertTriangle size={15} className="mt-px shrink-0" />
                {line.discountExcessPercent} points over the {line.maxDiscountPercent}% ceiling —
                this line will push the quote into approval.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

const CEILING_LABELS: Record<PricedLine['ceilingSource'], string> = {
  CATEGORY_RULE: 'category rule',
  TIER_RULE: 'tier rule',
  TIER_DEFAULT: 'tier default',
  NONE: 'no rule — discounting blocked',
};

function Row({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="text-right">
        <span className={strong ? 'text-[15px] font-bold text-slate-900' : 'text-[14px] font-medium text-slate-800'}>
          {value}
        </span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}
