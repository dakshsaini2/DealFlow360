import { Fragment, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  Percent,
  Plus,
  Repeat,
  Save,
  SlidersHorizontal,
  Warehouse,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Modal,
  PageHeader,
  SelectField,
  Spinner,
  TextField,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { fetchProducts, type ProductSummary } from '../../../util/catalog';
import {
  SETTING_LABELS,
  createPlan,
  createTier,
  createWarehouse,
  deleteDiscountRule,
  fetchAdminPlans,
  fetchAdminWarehouses,
  fetchGovernance,
  fetchSettings,
  fetchWarehouseStock,
  setStock,
  updateSettings,
  updateTier,
  updateWarehouse,
  upsertDiscountRule,
  type AdminPlan,
  type AdminSetting,
  type AdminStockRow,
  type AdminWarehouse,
  type Governance,
} from '../../../util/admin';

type Tab = 'warehouses' | 'plans' | 'discounts' | 'thresholds';

const TABS: { id: Tab; label: string; icon: typeof Warehouse }[] = [
  { id: 'warehouses', label: 'Warehouses & stock', icon: Warehouse },
  { id: 'plans', label: 'Subscription plans', icon: Repeat },
  { id: 'discounts', label: 'Discount governance', icon: Percent },
  { id: 'thresholds', label: 'Thresholds', icon: SlidersHorizontal },
];

/**
 * Backend configuration (spec section A).
 *
 * Everything on this screen is read live by the rest of the platform: the split
 * engine reads the warehouses, the billing engine reads the plans, and the
 * pricing engine reads the ceilings. Nothing here is decorative.
 */
export default function Backend() {
  const [tab, setTab] = useState<Tab>('warehouses');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backend configuration"
        subtitle="Warehouses, recurring plans and the discount ceilings every quote is checked against."
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setNotice('');
              setError('');
            }}
            className={`-mb-px flex cursor-pointer items-center gap-2 border-none border-b-2 bg-transparent px-4 py-2.5 text-[14px] font-medium transition-colors ${
              tab === id
                ? 'border-b-brand-600 text-brand-700'
                : 'border-b-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
          {notice}
        </p>
      )}

      {tab === 'warehouses' && <Warehouses onError={setError} onNotice={setNotice} />}
      {tab === 'plans' && <Plans onError={setError} onNotice={setNotice} />}
      {tab === 'discounts' && <Discounts onError={setError} onNotice={setNotice} />}
      {tab === 'thresholds' && <Thresholds onError={setError} onNotice={setNotice} />}
    </div>
  );
}

type PanelProps = { onError: (message: string) => void; onNotice: (message: string) => void };

/* ── warehouses & stock ───────────────────────────── */

function Warehouses({ onError, onNotice }: PanelProps) {
  const [warehouses, setWarehouses] = useState<AdminWarehouse[] | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [stocking, setStocking] = useState<AdminWarehouse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Bumped after a stock write so the open panel refetches instead of showing
  // the numbers it loaded before the change.
  const [stockVersion, setStockVersion] = useState(0);

  const load = useCallback(() => {
    fetchAdminWarehouses()
      .then(setWarehouses)
      .catch((err) => onError(getApiErrorMessage(err, 'Could not load warehouses.')));
  }, [onError]);

  useEffect(load, [load]);

  useEffect(() => {
    fetchProducts({ pageSize: 100 })
      .then((result) => setProducts(result.data))
      .catch(() => undefined);
  }, []);

  if (!warehouses) return <Spinner />;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Warehouses</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Shipping weight multiplies the base shipment cost — the split engine uses it to
              break ties between depots that could both fill an order.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} />
            New warehouse
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 text-center font-semibold">SKUs stocked</th>
                <th className="px-3 py-3 text-center font-semibold">Ship weight</th>
                <th className="px-3 py-3 text-center font-semibold">Active</th>
                <th className="px-5 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {warehouses.map((warehouse) => (
                <Fragment key={warehouse.id}>
                <tr>
                  <td className="px-5 py-3 text-[13px] font-semibold text-slate-900">
                    {warehouse.code}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-slate-700">
                    {warehouse.name}
                    {warehouse.address && (
                      <p className="text-[11px] text-slate-400">{warehouse.address}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) =>
                          current === warehouse.id ? null : warehouse.id,
                        )
                      }
                      disabled={warehouse._count.inventory === 0}
                      aria-expanded={expanded === warehouse.id}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border-none bg-transparent px-2 py-1 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
                    >
                      {warehouse._count.inventory > 0 &&
                        (expanded === warehouse.id ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        ))}
                      {warehouse._count.inventory}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <WeightField
                      warehouse={warehouse}
                      onSaved={(updated) => {
                        setWarehouses((current) =>
                          (current ?? []).map((row) => (row.id === updated.id ? updated : row)),
                        );
                        onNotice(`${updated.code} now ships at ×${updated.shippingCostWeight}.`);
                      }}
                      onError={onError}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge tone={warehouse.isActive ? 'green' : 'neutral'}>
                      {warehouse.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="secondary" onClick={() => setStocking(warehouse)}>
                      Set stock
                    </Button>
                  </td>
                </tr>
                {expanded === warehouse.id && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50/60 px-5 py-4">
                      <StockTable
                        key={`${warehouse.id}-${stockVersion}`}
                        warehouse={warehouse}
                        onError={onError}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && (
        <WarehouseDialog
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            try {
              const created = await createWarehouse(input);
              setCreating(false);
              onNotice(`${created.code} created.`);
              load();
            } catch (err) {
              onError(getApiErrorMessage(err, 'That warehouse could not be created.'));
              setCreating(false);
            }
          }}
        />
      )}

      {stocking && (
        <StockDialog
          warehouse={stocking}
          products={products}
          onClose={() => setStocking(null)}
          onSubmit={async (productId, onHandQuantity) => {
            const target = stocking;
            setStocking(null);

            try {
              const stock = await setStock(target.id, { productId, onHandQuantity });
              onNotice(
                `${target.code} now holds ${stock.onHandQuantity} (${stock.available} free).`,
              );
              setExpanded(target.id);
              setStockVersion((version) => version + 1);
              load();
            } catch (err) {
              onError(getApiErrorMessage(err, 'That stock level could not be set.'));
            }
          }}
        />
      )}
    </>
  );
}

/**
 * The stock a warehouse holds, opened from its SKU count. On-hand is what is
 * physically there; reserved is what orders have already claimed, so the free
 * column is the one that answers "can we ship from here".
 */
function StockTable({
  warehouse,
  onError,
}: {
  warehouse: AdminWarehouse;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<AdminStockRow[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchWarehouseStock(warehouse.id, controller.signal)
      .then(setRows)
      .catch((err) => {
        if (axios.isCancel(err)) return;
        onError(getApiErrorMessage(err, `Could not load the stock in ${warehouse.code}.`));
      });

    return () => controller.abort();
  }, [warehouse.id, warehouse.code, onError]);

  if (!rows) return <Spinner className="py-6" />;

  if (rows.length === 0) {
    return <p className="text-[13px] text-slate-500">Nothing is stocked here yet.</p>;
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-3 font-semibold">Item</th>
          <th className="px-3 py-2 text-right font-semibold">On hand</th>
          <th className="px-3 py-2 text-right font-semibold">Reserved</th>
          <th className="px-3 py-2 text-right font-semibold">Free</th>
          <th className="px-3 py-2 text-right font-semibold">Reorder at</th>
          <th className="py-2 pl-3 font-semibold">Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200/70">
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="py-2.5 pr-3">
              <p className="text-[13px] font-medium text-slate-800">
                {row.product.name}
                {row.variant && <span className="text-slate-500"> — {row.variant.name}</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                {row.variant?.sku ?? row.product.sku} · per {row.product.unit}
              </p>
            </td>
            <td className="px-3 py-2.5 text-right text-[13px] text-slate-700">{row.onHand}</td>
            <td className="px-3 py-2.5 text-right text-[13px] text-slate-500">
              {row.reserved === 0 ? '—' : row.reserved}
            </td>
            <td className="px-3 py-2.5 text-right">
              {row.belowReorderLevel ? (
                <Badge tone="amber">{row.available} free</Badge>
              ) : (
                <span className="text-[13px] font-medium text-slate-900">{row.available}</span>
              )}
            </td>
            <td className="px-3 py-2.5 text-right text-[13px] text-slate-500">
              {row.reorderLevel === 0 ? '—' : row.reorderLevel}
            </td>
            <td className="py-2.5 pl-3 text-[12px] text-slate-400">
              {new Date(row.updatedAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Edited in place, since changing a weight is the common case here. */
function WeightField({
  warehouse,
  onSaved,
  onError,
}: {
  warehouse: AdminWarehouse;
  onSaved: (warehouse: AdminWarehouse) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(String(warehouse.shippingCostWeight));

  useEffect(() => setValue(String(warehouse.shippingCostWeight)), [warehouse.shippingCostWeight]);

  return (
    <input
      type="number"
      min={0.1}
      max={10}
      step={0.1}
      value={value}
      aria-label={`Shipping weight for ${warehouse.code}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        const next = Number(value);

        if (!Number.isFinite(next) || next === warehouse.shippingCostWeight) {
          setValue(String(warehouse.shippingCostWeight));
          return;
        }

        try {
          onSaved(await updateWarehouse(warehouse.id, { shippingCostWeight: next }));
        } catch (err) {
          onError(getApiErrorMessage(err, 'That weight could not be saved.'));
          setValue(String(warehouse.shippingCostWeight));
        }
      }}
      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-[13px] outline-none focus:border-brand-500"
    />
  );
}

function WarehouseDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    code: string;
    name: string;
    address?: string;
    shippingCostWeight: number;
  }) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [weight, setWeight] = useState('1');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New warehouse" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          id="wh-code"
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="WH-NORTH"
        />
        <TextField
          id="wh-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Northern Depot"
        />
        <TextField
          id="wh-address"
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <TextField
          id="wh-weight"
          label="Shipping cost weight"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          hint="1.0 is average. Lower is cheaper to ship from."
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={code.trim().length < 2 || name.trim().length < 2}
            onClick={() => {
              setBusy(true);
              onSubmit({
                code: code.trim(),
                name: name.trim(),
                address: address.trim() || undefined,
                shippingCostWeight: Number(weight) || 1,
              });
            }}
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StockDialog({
  warehouse,
  products,
  onClose,
  onSubmit,
}: {
  warehouse: AdminWarehouse;
  products: ProductSummary[];
  onClose: () => void;
  onSubmit: (productId: string, onHandQuantity: number) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState('100');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`Set stock — ${warehouse.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          This sets on-hand quantity. Reserved stock belongs to the fulfillment engine and is not
          touched — restocking here is what clears a backorder.
        </p>
        <SelectField
          id="stock-product"
          label="Product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} — {product.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id="stock-quantity"
          label="On-hand quantity"
          type="number"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!productId}
            onClick={() => {
              setBusy(true);
              onSubmit(productId, Number(quantity) || 0);
            }}
          >
            Set stock
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── subscription plans ───────────────────────────── */

function Plans({ onError, onNotice }: PanelProps) {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetchAdminPlans()
      .then(setPlans)
      .catch((err) => onError(getApiErrorMessage(err, 'Could not load plans.')));
  }, [onError]);

  useEffect(load, [load]);

  if (!plans) return <Spinner />;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Recurring plans</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              A plan decides the billing cadence of a subscription line and whether a mid-cycle
              change is prorated.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} />
            New plan
          </Button>
        </div>

        <ul className="divide-y divide-slate-100">
          {plans.map((plan) => (
            <li key={plan.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">
                    {plan.name}
                    <span className="ml-2 text-[12px] font-normal text-slate-400">
                      every {plan.intervalCount === 1 ? '' : `${plan.intervalCount} `}
                      {plan.billingInterval.toLowerCase()}
                      {plan.intervalCount === 1 ? '' : 's'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-400">
                    {plan.products.length} product{plan.products.length === 1 ? '' : 's'} ·{' '}
                    {plan.subscriptionLineCount} live line
                    {plan.subscriptionLineCount === 1 ? '' : 's'}
                  </p>
                  {plan.cancellationPolicy && (
                    <p className="mt-1 text-[12px] text-slate-500">{plan.cancellationPolicy}</p>
                  )}
                  {plan.products.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {plan.products.map((product) => product.sku).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={plan.prorationEnabled ? 'brand' : 'neutral'}>
                    {plan.prorationEnabled ? 'prorated' : 'no proration'}
                  </Badge>
                  <Badge tone={plan.isActive ? 'green' : 'neutral'}>
                    {plan.isActive ? 'active' : 'inactive'}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {creating && (
        <PlanDialog
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            setCreating(false);

            try {
              const plan = await createPlan(input);
              onNotice(`${plan.name} created.`);
              load();
            } catch (err) {
              onError(getApiErrorMessage(err, 'That plan could not be created.'));
            }
          }}
        />
      )}
    </>
  );
}

function PlanDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    billingInterval: string;
    intervalCount: number;
    prorationEnabled: boolean;
    cancellationPolicy?: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [interval, setInterval] = useState('MONTH');
  const [count, setCount] = useState('1');
  const [prorate, setProrate] = useState(true);
  const [policy, setPolicy] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New subscription plan" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          id="plan-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Biannual"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id="plan-interval"
            label="Interval"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            <option value="DAY">Day</option>
            <option value="WEEK">Week</option>
            <option value="MONTH">Month</option>
            <option value="YEAR">Year</option>
          </SelectField>
          <TextField
            id="plan-count"
            label="Every"
            type="number"
            min={1}
            max={36}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5">
          <input
            type="checkbox"
            checked={prorate}
            onChange={(e) => setProrate(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-[13px] font-medium text-slate-800">
              Prorate mid-cycle changes
            </span>
            <span className="block text-[12px] text-slate-500">
              A quantity change part-way through a period is charged or credited for the
              remaining days.
            </span>
          </span>
        </label>
        <TextField
          id="plan-policy"
          label="Cancellation policy"
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
          placeholder="Cancel with 30 days notice."
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={() => {
              setBusy(true);
              onSubmit({
                name: name.trim(),
                billingInterval: interval,
                intervalCount: Number(count) || 1,
                prorationEnabled: prorate,
                cancellationPolicy: policy.trim() || undefined,
              });
            }}
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── discount governance ──────────────────────────── */

function Discounts({ onError, onNotice }: PanelProps) {
  const [governance, setGovernance] = useState<Governance | null>(null);
  const [creatingTier, setCreatingTier] = useState(false);
  const [addingRule, setAddingRule] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchGovernance()
      .then(setGovernance)
      .catch((err) => onError(getApiErrorMessage(err, 'Could not load discount rules.')));
  }, [onError]);

  useEffect(load, [load]);

  if (!governance) return <Spinner />;

  return (
    <>
      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Approval routing</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            Which blended risk band routes to whom. A quote is scored against these the moment it
            is sent.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {governance.approvalPolicies.map((policy) => (
            <li key={policy.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-900">{policy.name}</p>
                <p className="text-[12px] text-slate-400">{policy.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>
                  risk {policy.riskMin}–{policy.riskMax}
                </Badge>
                {policy.steps.length === 0 ? (
                  <Badge tone="green">auto-approve</Badge>
                ) : (
                  policy.steps.map((step) => (
                    <Badge key={step.id} tone="amber">
                      {step.stepOrder}. {step.role.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Discount ceilings</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              A category rule beats the tier default. This is what makes "hardware may go to 15%
              but services only to 10%" work inside one quote.
            </p>
          </div>
          <Button onClick={() => setCreatingTier(true)}>
            <Plus size={15} />
            New tier
          </Button>
        </div>

        <ul className="divide-y divide-slate-100">
          {governance.tiers.map((tier) => (
            <li key={tier.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">{tier.name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">
                    {tier._count.customers} customer{tier._count.customers === 1 ? '' : 's'}
                    {tier.description ? ` · ${tier.description}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-slate-400">tier default</span>
                  <CeilingField
                    tierId={tier.id}
                    value={tier.defaultDiscountCeiling ?? 0}
                    onSaved={(percent) => {
                      onNotice(`${tier.name} default ceiling is now ${percent}%.`);
                      load();
                    }}
                    onError={onError}
                  />
                  <Button variant="secondary" onClick={() => setAddingRule(tier.id)}>
                    Category rule
                  </Button>
                </div>
              </div>

              {tier.discountRules.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {tier.discountRules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
                    >
                      <span className="font-medium text-slate-700">
                        {rule.category?.name ?? 'All categories'}
                      </span>
                      <span className="font-semibold text-brand-700">
                        {rule.maxDiscountPercent}%
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${rule.category?.name ?? 'tier-wide'} rule`}
                        onClick={async () => {
                          try {
                            await deleteDiscountRule(rule.id);
                            load();
                          } catch (err) {
                            onError(getApiErrorMessage(err, 'That rule could not be removed.'));
                          }
                        }}
                        className="cursor-pointer border-none bg-transparent px-1 text-slate-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {creatingTier && (
        <TierDialog
          onClose={() => setCreatingTier(false)}
          onSubmit={async (input) => {
            setCreatingTier(false);

            try {
              const tier = await createTier(input);
              onNotice(`${tier.name} created at a ${tier.defaultDiscountCeiling}% ceiling.`);
              load();
            } catch (err) {
              onError(getApiErrorMessage(err, 'That tier could not be created.'));
            }
          }}
        />
      )}

      {addingRule && (
        <RuleDialog
          categories={governance.categories}
          onClose={() => setAddingRule(null)}
          onSubmit={async (categoryId, percent) => {
            const tierId = addingRule;
            setAddingRule(null);

            try {
              await upsertDiscountRule({
                customerTierId: tierId,
                categoryId: categoryId || null,
                maxDiscountPercent: percent,
              });
              onNotice('Ceiling saved — every new quote is checked against it immediately.');
              load();
            } catch (err) {
              onError(getApiErrorMessage(err, 'That rule could not be saved.'));
            }
          }}
        />
      )}
    </>
  );
}

function CeilingField({
  tierId,
  value,
  onSaved,
  onError,
}: {
  tierId: string;
  value: number;
  onSaved: (percent: number) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={draft}
        aria-label="Tier default ceiling"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          const next = Number(draft);

          if (!Number.isFinite(next) || next === value) {
            setDraft(String(value));
            return;
          }

          try {
            await updateTier(tierId, { defaultDiscountCeiling: next });
            onSaved(next);
          } catch (err) {
            onError(getApiErrorMessage(err, 'That ceiling could not be saved.'));
            setDraft(String(value));
          }
        }}
        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-[13px] outline-none focus:border-brand-500"
      />
      <span className="text-[13px] text-slate-400">%</span>
    </div>
  );
}

function TierDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description?: string;
    defaultDiscountCeiling: number;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ceiling, setCeiling] = useState('10');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New customer tier" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          id="tier-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Strategic"
        />
        <TextField
          id="tier-description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          id="tier-ceiling"
          label="Default discount ceiling (%)"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={ceiling}
          onChange={(e) => setCeiling(e.target.value)}
          hint="Used when no category rule is more specific."
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={() => {
              setBusy(true);
              onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                defaultDiscountCeiling: Number(ceiling) || 0,
              });
            }}
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RuleDialog({
  categories,
  onClose,
  onSubmit,
}: {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (categoryId: string, maxDiscountPercent: number) => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [percent, setPercent] = useState('15');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Category discount ceiling" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Setting the same category twice edits the existing rule rather than adding a second
          one, so the pricing engine never has two ceilings to choose between.
        </p>
        <SelectField
          id="rule-category"
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories (tier-wide)</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id="rule-percent"
          label="Maximum discount (%)"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              onSubmit(categoryId, Number(percent) || 0);
            }}
          >
            Save ceiling
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── thresholds ───────────────────────────────────── */

function Thresholds({ onError, onNotice }: PanelProps) {
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((result) => {
        setSettings(result);
        setDraft(Object.fromEntries(result.map((row) => [row.key, row.value])));
      })
      .catch((err) => onError(getApiErrorMessage(err, 'Could not load thresholds.')));
  }, [onError]);

  if (!settings) return <Spinner />;

  const changed = settings.filter((row) => draft[row.key] !== row.value);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Tunable thresholds</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            The values the spec calls "configured". Every engine reads these at runtime rather
            than holding a constant.
          </p>
        </div>
        <Button
          loading={busy}
          disabled={changed.length === 0}
          onClick={async () => {
            setBusy(true);

            try {
              const updated = await updateSettings(
                changed.map((row) => ({ key: row.key, value: draft[row.key] ?? row.value })),
              );
              setSettings(updated);
              setDraft(Object.fromEntries(updated.map((row) => [row.key, row.value])));
              onNotice(`${changed.length} threshold${changed.length === 1 ? '' : 's'} saved.`);
            } catch (err) {
              onError(getApiErrorMessage(err, 'Those thresholds could not be saved.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={15} />
          Save {changed.length > 0 ? `(${changed.length})` : ''}
        </Button>
      </div>

      <ul className="divide-y divide-slate-100">
        {settings.map((setting) => (
          <li key={setting.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <p className="text-[13px] font-medium text-slate-800">
                {SETTING_LABELS[setting.key] ?? setting.key}
              </p>
              <p className="text-[11px] text-slate-400">
                {setting.key} · default {setting.default}
                {setting.isDefault ? '' : ' · overridden'}
              </p>
            </div>
            <input
              type="number"
              step="any"
              value={draft[setting.key] ?? ''}
              aria-label={SETTING_LABELS[setting.key] ?? setting.key}
              onChange={(e) =>
                setDraft((current) => ({ ...current, [setting.key]: e.target.value }))
              }
              className={`w-28 rounded-lg border px-2.5 py-1.5 text-center text-[13px] outline-none focus:border-brand-500 ${
                draft[setting.key] !== setting.value
                  ? 'border-brand-300 bg-brand-50 font-semibold'
                  : 'border-slate-200'
              }`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
