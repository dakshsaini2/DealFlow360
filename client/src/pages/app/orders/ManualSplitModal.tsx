import { useMemo, useState } from 'react';
import { Button, Modal, TextAreaField } from '../../../components/ui';
import type { AllocationPlan, WarehouseWithStock } from '../../../util/fulfillment';
import { firstError, maxLength, numeric } from '../../../util/validation';

type Draft = Record<string, Record<string, string>>;

/**
 * Each box is optional — blank means "nothing from here" — so `required` is
 * deliberately absent. The server takes whole units only.
 */
const ALLOCATION_RULES = [
  numeric({ min: 0, max: 1_000_000, integer: true, label: 'An allocation' }),
];

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
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(orderLineId: string, warehouseId: string, value: string) {
    setError('');
    setDraft((current) => ({
      ...current,
      [orderLineId]: { ...(current[orderLineId] ?? {}), [warehouseId]: value },
    }));
  }

  /** The typed figure for one box, or null while it is usable. */
  function cellError(orderLineId: string, warehouseId: string) {
    return firstError(draft[orderLineId]?.[warehouseId] ?? '', ALLOCATION_RULES);
  }

  const allocations = lines.flatMap((line) =>
    warehouses.flatMap((warehouse) => {
      const quantity = Number(draft[line.orderLineId]?.[warehouse.id] ?? 0);

      return quantity > 0
        ? [{ orderLineId: line.orderLineId, warehouseId: warehouse.id, quantity }]
        : [];
    }),
  );

  function handleSubmit() {
    const badCell = lines
      .flatMap((line) => warehouses.map((warehouse) => cellError(line.orderLineId, warehouse.id)))
      .find((message) => message !== null);

    if (badCell) {
      setError(badCell);
      return;
    }

    const badReason = firstError(reason, [maxLength(400, 'A reason')]);

    if (badReason) {
      setReasonError(badReason);
      return;
    }

    if (allocations.length === 0) {
      setError('Source at least one unit, or cancel to keep the suggested split.');
      return;
    }

    setError('');
    setBusy(true);
    onSubmit(allocations, reason.trim() || undefined);
  }

  return (
    <Modal title="Manual warehouse split" onClose={onClose} width="lg">
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
                const invalid = cellError(line.orderLineId, warehouse.id);

                return (
                  <div key={warehouse.id} className="flex flex-col gap-1">
                    <label htmlFor={inputId} className="text-[12px] font-medium text-slate-600">
                      {warehouse.code}
                    </label>
                    <input
                      id={inputId}
                      type="number"
                      min={0}
                      step={1}
                      aria-invalid={invalid ? true : undefined}
                      aria-describedby={invalid ? `${inputId}-error` : undefined}
                      value={draft[line.orderLineId]?.[warehouse.id] ?? ''}
                      onChange={(e) => set(line.orderLineId, warehouse.id, e.target.value)}
                      placeholder="0"
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-[13px] outline-none ${
                        invalid
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-slate-200 focus:border-brand-500'
                      }`}
                    />
                    {invalid ? (
                      <span
                        id={`${inputId}-error`}
                        role="alert"
                        className="text-[11px] font-medium text-red-600"
                      >
                        {invalid}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {stock ? `${stock.available} free` : 'no stock row'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <TextAreaField
          id="override-reason"
          label="Reason"
          rows={2}
          maxLength={400}
          value={reason}
          error={reasonError}
          onChange={(e) => {
            setReasonError('');
            setReason(e.target.value);
          }}
          onBlur={() => setReasonError(firstError(reason, [maxLength(400, 'A reason')]) ?? '')}
          placeholder="Why is the suggested split being overridden?"
          hint="Optional. It is kept with the allocation record."
        />

        {error && (
          <p role="alert" className="text-[12px] font-medium text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={handleSubmit}>
            Apply split
          </Button>
        </div>
      </div>
    </Modal>
  );
}
