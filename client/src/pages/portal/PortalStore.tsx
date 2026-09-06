import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus, Repeat, Search, ShoppingCart, Trash2 } from 'lucide-react';
import axios from 'axios';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { currency } from '../../util/catalog';
import { planCadence } from '../../util/orders';
import {
  fetchPortalAccounts,
  fetchStoreCategories,
  fetchStoreProducts,
  submitPortalRequest,
  type PortalAccount,
  type StoreCategory,
  type StoreProduct,
} from '../../util/portal';

const CART_KEY = 'dealflow360.portal.cart';
const SEARCH_DEBOUNCE_MS = 300;

type CartLine = {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subscriptionPlanId?: string;
  planName?: string;
};

/**
 * The customer's storefront.
 *
 * Submitting does not place an order — it raises a *request* that lands as a
 * draft with the account's rep, who prices it and sends it back. That is what
 * keeps discount governance on the seller's side: a customer can ask for
 * anything, but the discount and its approval are still the rep's to make.
 */
export default function PortalStore() {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartLine[];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);

  // The basket survives navigating away and back; it is per-browser and never
  // reaches the server until the request is submitted.
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* storage unavailable — the cart just won't survive a reload */
    }
  }, [cart]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchPortalAccounts(controller.signal),
      fetchStoreCategories(controller.signal),
    ])
      .then(([accountList, categoryList]) => {
        setAccounts(accountList);
        setAccountId((current) => current || accountList[0]?.id || '');
        setCategories(categoryList);
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setError(getApiErrorMessage(err, 'Could not open the store.'));
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    (signal: AbortSignal) => {
      if (!accountId) return;

      setLoading(true);

      fetchStoreProducts(
        {
          customerId: accountId,
          q: query || undefined,
          categoryId: categoryId || undefined,
          pageSize: 60,
        },
        signal,
      )
        .then((result) => {
          setProducts(result.data);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load products.'));
          setLoading(false);
        });
    },
    [accountId, query, categoryId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  const cartTotal = useMemo(
    () => cart.reduce((total, line) => total + line.unitPrice * line.quantity, 0),
    [cart],
  );

  function addToCart(product: StoreProduct, planId?: string) {
    if (product.unitPrice === null) return;

    const plan = product.subscriptionPlans.find((entry) => entry.id === planId);

    setCart((current) => {
      // The same product on two different plans is two lines, not one.
      const match = current.find(
        (line) => line.productId === product.id && line.subscriptionPlanId === planId,
      );

      if (match) {
        return current.map((line) =>
          line === match ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice: product.unitPrice!,
          quantity: 1,
          ...(planId ? { subscriptionPlanId: planId, planName: plan?.name } : {}),
        },
      ];
    });
  }

  function setQuantity(index: number, quantity: number) {
    setCart((current) =>
      quantity <= 0
        ? current.filter((_, i) => i !== index)
        : current.map((line, i) => (i === index ? { ...line, quantity } : line)),
    );
  }

  const account = accounts.find((entry) => entry.id === accountId);
  const inCart = (productId: string) => cart.some((line) => line.productId === productId);

  const selectClasses =
    'cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Browse products"
        subtitle={
          account
            ? `Prices shown are yours as a ${account.tier ?? 'standard'} account.`
            : 'Pick what you need and we will put a quotation together.'
        }
        action={
          <Button onClick={() => setCartOpen(true)} disabled={cart.length === 0}>
            <ShoppingCart size={15} />
            Request list
            {cart.length > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                {cart.length}
              </span>
            )}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Filter by category"
          className={selectClasses}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        {/* Only shown when the contact actually covers more than one account. */}
        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Buying for"
            className={selectClasses}
          >
            {accounts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                Buying for {entry.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState title="Nothing matches that" description="Try a different search or category." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              inCart={inCart(product.id)}
              onAdd={(planId) => addToCart(product, planId)}
            />
          ))}
        </div>
      )}

      {cartOpen && (
        <RequestDialog
          cart={cart}
          total={cartTotal}
          accountName={account?.name ?? ''}
          onClose={() => setCartOpen(false)}
          onQuantity={setQuantity}
          onSubmit={async (message) => {
            try {
              const request = await submitPortalRequest({
                customerId: accountId,
                lines: cart.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  ...(line.subscriptionPlanId
                    ? { subscriptionPlanId: line.subscriptionPlanId }
                    : {}),
                })),
                message: message || undefined,
              });

              setCart([]);
              setCartOpen(false);
              navigate(`/portal/quotations/${request.id}`);
            } catch (err) {
              setError(getApiErrorMessage(err, 'That request could not be sent.'));
              setCartOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: StoreProduct;
  inCart: boolean;
  onAdd: (planId?: string) => void;
}) {
  const [planId, setPlanId] = useState('');
  const hasPlans = product.subscriptionPlans.length > 0;

  return (
    <Card className="flex flex-col justify-between p-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">{product.name}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {product.sku} · {product.category.name}
            </p>
          </div>
          {hasPlans && (
            <Badge tone="brand">
              <Repeat size={10} className="mr-1" />
              plan
            </Badge>
          )}
        </div>

        {product.description && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-slate-500">
            {product.description}
          </p>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <p className="font-display text-[20px] font-bold text-slate-900">
            {product.unitPrice === null ? '—' : currency.format(product.unitPrice)}
          </p>
          {product.listPrice !== null && (
            <p className="text-[12px] text-slate-400 line-through">
              {currency.format(product.listPrice)}
            </p>
          )}
          <p className="text-[11px] text-slate-400">/ {product.unit}</p>
        </div>

        {hasPlans && (
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            aria-label={`Billing for ${product.sku}`}
            className="mt-2.5 w-full cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-600 outline-none focus:border-brand-500"
          >
            <option value="">Buy once</option>
            {product.subscriptionPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                Subscribe — {planCadence(plan)}
              </option>
            ))}
          </select>
        )}

        <Button
          variant={inCart ? 'secondary' : 'primary'}
          className="mt-2.5 w-full"
          disabled={product.unitPrice === null}
          onClick={() => onAdd(planId || undefined)}
        >
          {inCart ? <Check size={15} /> : <Plus size={15} />}
          {inCart ? 'Add another' : 'Add to request'}
        </Button>
      </div>
    </Card>
  );
}

function RequestDialog({
  cart,
  total,
  accountName,
  onClose,
  onQuantity,
  onSubmit,
}: {
  cart: CartLine[];
  total: number;
  accountName: string;
  onClose: () => void;
  onQuantity: (index: number, quantity: number) => void;
  onSubmit: (message: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Request a quotation" onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          This asks your account manager to put a quotation together for{' '}
          <strong className="text-slate-800">{accountName}</strong>. Nothing is ordered yet —
          they will come back with final pricing for you to review.
        </p>

        <ul className="flex flex-col gap-2">
          {cart.map((line, index) => (
            <li
              key={`${line.productId}-${line.subscriptionPlanId ?? 'once'}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900">{line.name}</p>
                <p className="text-[11px] text-slate-400">
                  {line.sku} · {currency.format(line.unitPrice)}
                  {line.planName ? ` · ${line.planName} plan` : ''}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Fewer ${line.sku}`}
                  onClick={() => onQuantity(index, line.quantity - 1)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                >
                  <Minus size={13} />
                </button>
                <span className="w-8 text-center text-[13px] font-medium text-slate-800">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`More ${line.sku}`}
                  onClick={() => onQuantity(index, line.quantity + 1)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                >
                  <Plus size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${line.sku}`}
                  onClick={() => onQuantity(index, 0)}
                  className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-300 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between rounded-xl bg-slate-50 px-3.5 py-3">
          <span className="text-[13px] text-slate-500">Indicative total, before tax</span>
          <span className="font-display text-[18px] font-bold text-slate-900">
            {currency.format(total)}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="request-note" className="text-[13px] font-medium text-slate-700">
            Anything we should know? (optional)
          </label>
          <textarea
            id="request-note"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Timing, budget, volumes you are considering…"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep browsing
          </Button>
          <Button
            loading={busy}
            disabled={cart.length === 0}
            onClick={() => {
              setBusy(true);
              onSubmit(message.trim());
            }}
          >
            Send request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
