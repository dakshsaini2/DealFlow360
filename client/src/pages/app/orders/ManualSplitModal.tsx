import { useMemo, useState } from 'react';
import { Button, Modal } from '../../../components/ui';
import type { AllocationPlan, WarehouseWithStock } from '../../../util/fulfillment';

type Draft = Record<string, Record<string, string>>;

/**
 * Manual override of the suggested split. It opens pre-filled with what the
 * engine proposed, so an operator who only wants to move a few units does not
 * have to retype the whole plan — and the free-stock figure sits next to every
 * input, since that is the constraint the server will check against.
 */
export default function ManualSplitModal({
  suggestion,
  warehouses,
  onClose,
  onSubmit,
}: {
  suggestion: AllocationPlan;
  warehouses: WarehouseWithStock[];
  onClose: () => void;
  onSubmit: (
    allocations: { orderLineId: string; warehouseId: string; quantity: number }[],
    reason?: string,
  ) => void;
}) {
  // Every physical line on the order, with the quantity it still needs.
  const lines = useMemo(() => {
    const byLine = new Map<
      string,
      { orderLineId: string; sku: string; name: string; required: number }
    >();

    // A line can appear in both lists — partly sourced, partly short — so the
    // quantity it needs is the sum of the two.
    for (const entry of [...suggestion.allocations, ...suggestion.backorders]) {
      const existing = byLine.get(entry.orderLineId);

      if (existing) {
        existing.required += entry.quantity;
      } else {
        byLine.set(entry.orderLineId, {
          orderLineId: entry.orderLineId,
          sku: entry.sku,
          name: entry.productName,
          required: entry.quantity,
        });
      }
    }

    return [...byLine.values()];
  }, [suggestion]);

  const [draft, setDraft] = useState<Draft>(() => {
    const initial: Draft = {};

    for (const allocation of suggestion.allocations) {
      initial[allocation.orderLineId] ??= {};
      initial[allocation.orderLineId]![allocation.warehouseId] = String(allocation.quantity);
    }

    return initial;
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  function set(orderLineId: string, warehouseId: string, value: string) {
    setDraft((current) => ({
      ...current,
      [orderLineId]: { ...(current[orderLineId] ?? {}), [warehouseId]: value },
    }));
  }

  const allocations = lines.flatMap((line) =>
    warehouses.flatMap((warehouse) => {
      const quantity = Number(draft[line.orderLineId]?.[warehouse.id] ?? 0);

      return quantity > 0
        ? [{ orderLineId: line.orderLineId, warehouseId: warehouse.id, quantity }]
        : [];
    }),
  );

  return (
    <Modal title="Manual warehouse split" onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Set how much comes from each warehouse. Anything you leave unsourced becomes a
          backorder. Free stock is shown under each field.
        </p>

        {lines.map((line) => (
          <div key={line.orderLineId} className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-slate-900">
                {line.name || line.sku || 'Line'}
              </p>
              <p className="text-[12px] text-slate-400">needs {line.required}</p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {warehouses.map((warehouse) => {
                const stock = warehouse.stock.find((row) => row.product.sku === line.sku);
                const inputId = `alloc-${line.orderLineId}-${warehouse.id}`;

                return (
                  <div key={warehouse.id} className="flex flex-col gap-1">
                    <label htmlFor={inputId} className="text-[12px] font-medium text-slate-600">
                      {warehouse.code}
                    </label>
                    <input
                      id={inputId}
                      type="number"
                      min={0}
                      value={draft[line.orderLineId]?.[warehouse.id] ?? ''}
                      onChange={(e) => set(line.orderLineId, warehouse.id, e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-500"
                    />
                    <span className="text-[11px] text-slate-400">
                      {stock ? `${stock.available} free` : 'no stock row'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="override-reason" className="text-[13px] font-medium text-slate-700">
            Reason
          </label>
          <input
            id="override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the suggested split being overridden?"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none placeholder:text-slate-400 focus:border-brand-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={allocations.length === 0}
            onClick={() => {
              setBusy(true);
              onSubmit(allocations, reason.trim() || undefined);
            }}
          >
            Apply split
          </Button>
        </div>
      </div>
    </Modal>
  );
}
