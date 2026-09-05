import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import axios from 'axios';
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
import {
  currency,
  fetchCategories,
  fetchProducts,
  marginTone,
  type Category,
  type ProductListParams,
  type ProductSummary,
} from '../../../util/catalog';
import type { PageMeta } from '../../../util/customers';

const SEARCH_DEBOUNCE_MS = 300;

export default function ProductsList() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productType, setProductType] = useState<'' | 'GOODS' | 'SERVICE'>('');
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [sort, setSort] = useState<ProductListParams['sort']>('name');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();

    fetchCategories(controller.signal)
      .then(setCategories)
      .catch(() => {
        /* the filter just stays empty */
      });

    return () => controller.abort();
  }, []);

  const load = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);

      fetchProducts(
        {
          q: query || undefined,
          categoryId: categoryId || undefined,
          productType: productType || undefined,
          recurringOnly: recurringOnly ? 'true' : undefined,
          sort,
          page,
        },
        signal,
      )
        .then((result) => {
          setProducts(result.data);
          setMeta(result.meta);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not load the catalog.'));
          setLoading(false);
        });
    },
    [query, categoryId, productType, recurringOnly, sort, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  const selectClasses =
    'cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catalog"
        subtitle="Products, list prices and the margin each one carries before any discount."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or description…"
            aria-label="Search products"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-[14px] text-slate-800 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className={selectClasses}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.productCount})
            </option>
          ))}
        </select>

        <select
          value={productType}
          onChange={(e) => {
            setProductType(e.target.value as '' | 'GOODS' | 'SERVICE');
            setPage(1);
          }}
          aria-label="Filter by type"
          className={selectClasses}
        >
          <option value="">Goods & services</option>
          <option value="GOODS">Goods</option>
          <option value="SERVICE">Services</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ProductListParams['sort'])}
          aria-label="Sort"
          className={selectClasses}
        >
          <option value="name">Name</option>
          <option value="priceAsc">Price, low to high</option>
          <option value="priceDesc">Price, high to low</option>
        </select>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700">
          <input
            type="checkbox"
            checked={recurringOnly}
            onChange={(e) => {
              setRecurringOnly(e.target.checked);
              setPage(1);
            }}
            className="cursor-pointer accent-brand-600"
          />
          Recurring only
        </label>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card>
        {loading ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState title="No products found" description="Try clearing the filters above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 text-right font-semibold">List price</th>
                  <th className="px-5 py-3 text-right font-semibold">Cost</th>
                  <th className="px-5 py-3 text-right font-semibold">List margin</th>
                  <th className="px-5 py-3 font-semibold">Billing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/app/products/${product.id}`}
                        className="text-[14px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {product.name}
                      </Link>
                      <p className="text-[12px] text-slate-400">
                        {product.sku} · per {product.unit}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-600">
                      {product.category.name}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-medium text-slate-900">
                      {currency.format(product.basePrice)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[13px] text-slate-500">
                      {product.costPrice === null ? '—' : currency.format(product.costPrice)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {product.listMarginPercent === null ? (
                        <span className="text-[13px] text-slate-400">—</span>
                      ) : (
                        <Badge tone={marginTone(product.listMarginPercent)}>
                          {product.listMarginPercent}%
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {product.isRecurringCapable ? (
                        <Badge tone="brand">Recurring</Badge>
                      ) : (
                        <Badge>One-time</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-slate-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} products
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={meta.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={meta.page >= meta.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
