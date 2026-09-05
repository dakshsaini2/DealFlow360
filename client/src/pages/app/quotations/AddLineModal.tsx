import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, Button, ErrorBanner, Modal, Spinner } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency, fetchProducts, type ProductSummary } from '../../../util/catalog';

const DEBOUNCE_MS = 300;

export default function AddLineModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (product: ProductSummary, quantity: number) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetchProducts({ q: query || undefined, pageSize: 20 }, controller.signal)
      .then((result) => {
        setProducts(result.data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not search the catalog.'));
        setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  async function handlePick(product: ProductSummary) {
    setAdding(product.id);
    setError('');

    try {
      await onPick(product, Number(quantities[product.id] ?? 1) || 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not add that line.'));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Modal title="Add a product" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or SKU…"
            aria-label="Search products"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
          {loading ? (
            <Spinner />
          ) : products.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-400">No products found.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {products.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-slate-900">{product.name}</p>
                    <p className="text-[12px] text-slate-400">
                      {product.sku} · {product.category.name} · {currency.format(product.basePrice)}
                    </p>
                  </div>
                  {product.isRecurringCapable && <Badge tone="brand">Recurring</Badge>}
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantity for ${product.name}`}
                    value={quantities[product.id] ?? '1'}
                    onChange={(e) =>
                      setQuantities((current) => ({ ...current, [product.id]: e.target.value }))
                    }
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-[13px] outline-none focus:border-brand-500"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => handlePick(product)}
                    loading={adding === product.id}
                    disabled={adding !== null}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
