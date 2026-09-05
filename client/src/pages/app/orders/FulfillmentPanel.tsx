import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  PackageCheck,
  Sparkles,
  Truck,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { Badge, Button, Card, ErrorBanner, Spinner } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import { useAuth } from '../../../hooks/useAuth';
import {
  FULFILLMENT_TONE,
  METHOD_LABELS,
  acceptSplit,
  consolidateBackorders,
  fetchFulfillment,
  fetchWarehouses,
  overrideSplit,
  shipOrder,
  type FulfillmentResponse,
  type WarehouseWithStock,
} from '../../../util/fulfillment';
import ManualSplitModal from './ManualSplitModal';

/**
 * The B6 screen. It always shows two things at once: what the engine suggests
 * from live stock, and what has actually been committed. Before allocation
 * those are a proposal and nothing; afterwards the committed plan leads and the
 * suggestion becomes a reference.
 */
export default function FulfillmentPanel({
  orderId,
  onOrderChanged,
}: {
  orderId: string;
  onOrderChanged: () => void;
}) {
  const { hasRole } = useAuth();
  const [data, setData] = useState<FulfillmentResponse | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseWithStock[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [overriding, setOverriding] = useState(false);

  const canFulfil = hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE');

  useEffect(() => {
    const controller = new AbortController();

    fetchFulfillment(orderId, controller.signal)
      .then(setData)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load fulfillment.'));
      });

    return () => controller.abort();
  }, [orderId]);

  useEffect(() => {
    if (!canFulfil) return;

    const controller = new AbortController();

    fetchWarehouses({ orderId }, controller.signal)
      .then(setWarehouses)
      .catch(() => undefined);

    return () => controller.abort();
  }, [orderId, canFulfil]);

  const run = useCallback(
    async (action: () => Promise<FulfillmentResponse>) => {
      setBusy(true);
      setError('');

      try {
        setData(await action());
        // Allocating and shipping both move the order's own status.
        onOrderChanged();
      } catch (err) {
        setError(getApiErrorMessage(err, 'That fulfillment action failed.'));
      } finally {
        setBusy(false);
      }
    },
    [onOrderChanged],
  );

  if (!data) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  const { fulfillment, plan, isProposal, backorders, consolidatable, nonPhysicalLines } = data;
  const allocated = !isProposal;
  const shipped = fulfillment?.status === 'SHIPPED' || fulfillment?.status === 'DELIVERED';
  const nothingToShip = plan.allocations.length === 0 && plan.backorders.length === 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <WarehouseIcon size={15} className="text-slate-400" />
            Fulfillment
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {allocated
              ? 'Stock is reserved against this order.'
              : 'Proposed split from live stock — nothing is reserved yet.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {fulfillment && (
            <Badge tone={FULFILLMENT_TONE[fulfillment.status]}>
              {humanStatus(fulfillment.status)}
            </Badge>
          )}

          {canFulfil && !allocated && !nothingToShip && (
            <>
              <Button variant="secondary" onClick={() => setOverriding(true)} disabled={busy}>
                Manual override
              </Button>
              <Button onClick={() => run(() => acceptSplit(orderId))} loading={busy}>
                <Check size={15} />
                Accept suggested split
              </Button>
            </>
          )}

          {canFulfil && allocated && !shipped && (
            <Button onClick={() => run(() => shipOrder(orderId))} loading={busy}>
              <Truck size={15} />
              Ship allocated stock
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {/*
        The spec asks for this prompt to appear on its own when stock lands
        mid-fulfillment, so it is driven by the server's `consolidatable` list
        rather than by anything the operator has to notice first.
      */}
      {canFulfil && consolidatable.length > 0 && (
        <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} className="mt-px shrink-0 text-amber-500" />
            <div>
              <p className="text-[13px] font-semibold text-amber-900">
                Stock has arrived for {consolidatable.length} backordered line
                {consolidatable.length === 1 ? '' : 's'}
              </p>
              <p className="text-[12px] text-amber-700">
                {consolidatable
                  .map((entry) => `${entry.backorderedQuantity} needed, ${entry.nowAvailable} now free`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => run(() => consolidateBackorders(orderId))}
          >
            <PackageCheck size={15} />
            Consolidate remaining backorder
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-5 p-5">
        {nothingToShip && !allocated ? (
          <p className="text-[13px] text-slate-400">
            Nothing on this order ships from a warehouse — every line is a service or
            subscription.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Shipments" value={String(plan.shipmentCount)} />
              <Stat
                label={fulfillment?.actualShippingCost != null ? 'Actual shipping' : 'Est. shipping'}
                value={currency.format(plan.estimatedShippingCost)}
              />
              <Stat label="Method" value={METHOD_LABELS[plan.method] ?? plan.method} />
              <Stat
                label="Backordered"
                value={String(backorders.length)}
                tone={backorders.length > 0 ? 'amber' : undefined}
              />
            </div>

            <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-600">
              {plan.explanation}
            </p>

            {fulfillment ? (
              <Section title="Committed allocation">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2 font-semibold">Warehouse</th>
                      <th className="py-2 font-semibold">Product</th>
                      <th className="py-2 text-center font-semibold">Allocated</th>
                      <th className="py-2 text-center font-semibold">Shipped</th>
                      <th className="py-2 text-right font-semibold">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fulfillment.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td className="py-2.5 text-[13px] font-medium text-slate-900">
                          {allocation.warehouse.name}
                          <span className="ml-1.5 text-[11px] text-slate-400">
                            {allocation.warehouse.code}
                          </span>
                        </td>
                        <td className="py-2.5 text-[13px] text-slate-600">
                          {allocation.orderLine.product.name}
                          <span className="ml-1.5 text-[11px] text-slate-400">
                            {allocation.orderLine.product.sku}
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-[13px] text-slate-700">
                          {allocation.allocatedQuantity}
                        </td>
                        <td className="py-2.5 text-center text-[13px] text-slate-700">
                          {allocation.fulfilledQuantity}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge>{METHOD_LABELS[allocation.allocationMethod] ?? allocation.allocationMethod}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            ) : (
              <Section title="Suggested split">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2 font-semibold">Warehouse</th>
                      <th className="py-2 text-center font-semibold">Lines</th>
                      <th className="py-2 text-center font-semibold">Units</th>
                      <th className="py-2 text-right font-semibold">Ship weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.warehousesUsed.map((warehouse) => (
                      <tr key={warehouse.id}>
                        <td className="py-2.5 text-[13px] font-medium text-slate-900">
                          {warehouse.name}
                          <span className="ml-1.5 text-[11px] text-slate-400">{warehouse.code}</span>
                        </td>
                        <td className="py-2.5 text-center text-[13px] text-slate-700">
                          {warehouse.lineCount}
                        </td>
                        <td className="py-2.5 text-center text-[13px] text-slate-700">
                          {warehouse.unitCount}
                        </td>
                        <td className="py-2.5 text-right text-[13px] text-slate-500">
                          ×{warehouse.shippingCostWeight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {backorders.length > 0 && (
              <Section title="Backorders">
                <ul className="flex flex-col gap-2">
                  {backorders.map((backorder) => (
                    <li
                      key={backorder.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="mt-px shrink-0 text-amber-500" />
                        <div>
                          <p className="text-[13px] font-medium text-slate-800">
                            {backorder.quantity} × {backorder.product.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {backorder.product.sku} · waiting at {backorder.warehouse.name}
                            {backorder.expectedRestockDate
                              ? ` · restock expected ${new Date(
                                  backorder.expectedRestockDate,
                                ).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <Badge tone="amber">{humanStatus(backorder.status)}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {nonPhysicalLines.length > 0 && (
              <p className="text-[12px] text-slate-400">
                Not shipped from stock: {nonPhysicalLines.map((line) => line.name).join(', ')}.
              </p>
            )}
          </>
        )}
      </div>

      {overriding && (
        <ManualSplitModal
          suggestion={plan}
          warehouses={warehouses}
          onClose={() => setOverriding(false)}
          onSubmit={async (allocations, reason) => {
            setOverriding(false);
            await run(() => overrideSplit(orderId, allocations, reason));
          }}
        />
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-0.5 font-display text-[17px] font-bold ${
          tone === 'amber' ? 'text-amber-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
