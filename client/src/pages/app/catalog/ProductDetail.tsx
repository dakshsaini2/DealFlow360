import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import {
  currency,
  fetchProduct,
  marginTone,
  type ProductDetail as Product,
} from '../../../util/catalog';
import { tierTone } from '../../../util/customers';
import PriceCheckPanel from './PriceCheckPanel';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchProduct(id, controller.signal)
      .then(setProduct)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this product.'));
      });

    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!product) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · ${product.category.name} · priced per ${product.unit}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={product.productType === 'SERVICE' ? 'brand' : 'neutral'}>
          {product.productType === 'SERVICE' ? 'Service' : 'Goods'}
        </Badge>
        {product.isRecurringCapable && <Badge tone="brand">Recurring capable</Badge>}
        {product.listMarginPercent !== null && (
          <Badge tone={marginTone(product.listMarginPercent)}>
            {product.listMarginPercent}% list margin
          </Badge>
        )}
        {product.promotions.map((promotion) => (
          <Badge key={promotion.id} tone="amber">
            {promotion.name} · {promotion.discountValue}% off
          </Badge>
        ))}
        {!product.isActive && <Badge tone="red">Inactive</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="List price" value={currency.format(product.basePrice)} />
        <Stat
          label="Cost"
          value={product.costPrice === null ? '—' : currency.format(product.costPrice)}
        />
        <Stat label="Tax rate" value={`${product.taxRate}%`} />
        <Stat label="Stock available" value={String(product.totalAvailable)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Tier pricing
            </h2>
            {product.tierPricing.length === 0 ? (
              <EmptyState
                title="No tier pricing"
                description="Every customer pays the list price for this product."
              />
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-semibold">Tier</th>
                    <th className="px-5 py-3 font-semibold">Price list</th>
                    <th className="px-5 py-3 text-right font-semibold">Unit price</th>
                    <th className="px-5 py-3 text-right font-semibold">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {product.tierPricing.map((row) => {
                    const delta = product.basePrice
                      ? Math.round(((row.unitPrice - product.basePrice) / product.basePrice) * 1000) / -10
                      : 0;

                    return (
                      <tr key={`${row.priceListId}-${row.variantId ?? 'base'}`}>
                        <td className="px-5 py-3">
                          <Badge tone={tierTone(row.tier?.name)}>{row.tier?.name ?? 'Any'}</Badge>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-slate-600">
                          {row.priceListName}
                          <span className="text-slate-400"> · {row.currencyCode}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-[14px] font-medium text-slate-900">
                          {currency.format(row.unitPrice)}
                        </td>
                        <td className="px-5 py-3 text-right text-[13px] text-slate-500">
                          {delta === 0 ? '—' : `${delta}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Stock by warehouse
            </h2>
            {product.inventory.length === 0 ? (
              <EmptyState title="Not stocked" description="This product is not held in any warehouse." />
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-semibold">Warehouse</th>
                    <th className="px-5 py-3 text-right font-semibold">On hand</th>
                    <th className="px-5 py-3 text-right font-semibold">Reserved</th>
                    <th className="px-5 py-3 text-right font-semibold">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {product.inventory.map((row) => (
                    <tr key={row.warehouse.id}>
                      <td className="px-5 py-3 text-[13px] text-slate-700">
                        {row.warehouse.name}
                        <span className="text-slate-400"> · {row.warehouse.code}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] text-slate-600">{row.onHand}</td>
                      <td className="px-5 py-3 text-right text-[13px] text-slate-600">{row.reserved}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge tone={row.available <= row.reorderLevel ? 'amber' : 'green'}>
                          {row.available}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {product.relatedProducts.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Upsell &amp; cross-sell
              </h2>
              <ul className="divide-y divide-slate-100">
                {product.relatedProducts.map((relation) => (
                  <li
                    key={`${relation.relationshipType}-${relation.product.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/app/products/${relation.product.id}`}
                        className="text-[14px] font-medium text-slate-900 no-underline hover:text-brand-600"
                      >
                        {relation.product.name}
                      </Link>
                      <p className="text-[12px] text-slate-400">
                        {relation.relationshipType.replace('_', '-').toLowerCase()}
                        {relation.score !== null && ` · score ${relation.score}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] text-slate-600">
                      {currency.format(relation.product.basePrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <PriceCheckPanel product={product} />

          {product.subscriptionPlans.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Available plans
              </h2>
              <ul className="divide-y divide-slate-100">
                {product.subscriptionPlans.map((plan) => (
                  <li key={plan.id} className="px-5 py-3">
                    <p className="text-[14px] font-medium text-slate-900">{plan.name}</p>
                    <p className="text-[12px] text-slate-400">
                      every {plan.intervalCount} {plan.billingInterval.toLowerCase()}
                      {plan.intervalCount > 1 ? 's' : ''}
                      {plan.prorationEnabled && ' · prorated'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {product.variants.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Variants
              </h2>
              <ul className="divide-y divide-slate-100">
                {product.variants.map((variant) => (
                  <li key={variant.id} className="flex justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[14px] text-slate-800">{variant.name}</p>
                      <p className="text-[12px] text-slate-400">{variant.sku}</p>
                    </div>
                    <span className="text-[13px] text-slate-600">
                      +{currency.format(variant.extraPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/products"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      Catalog
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 font-display text-[22px] font-bold leading-none tracking-tight text-slate-900">
        {value}
      </p>
    </Card>
  );
}
