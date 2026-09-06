import { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
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
import { currency, fetchCategories, type Category } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import {
  downloadSalesCsv,
  fetchSalesReport,
  type SalesReport,
  type SalesReportParams,
} from '../../../util/reports';

/**
 * Sales reporting (spec A7).
 *
 * The four filters the spec names drive one request, so every panel on the page
 * is describing the same set of deals. Export is CSV for spreadsheets and the
 * browser's own print-to-PDF for the printed version — the `print:` classes
 * below are what make that second one produce something readable.
 */
export default function Reports() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [period, setPeriod] = useState<SalesReportParams['period']>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [salesRepId, setSalesRepId] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const params: SalesReportParams = {
    period,
    ...(period === 'custom' && from ? { from: new Date(from).toISOString() } : {}),
    ...(period === 'custom' && to ? { to: new Date(to).toISOString() } : {}),
    ...(salesRepId ? { salesRepId } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  const dateRangeError =
    period === 'custom' && Boolean(from && to && from > to)
      ? 'Start date must be before or on end date.'
      : null;

  const load = useCallback(
    (signal: AbortSignal) => {
      if (dateRangeError) return;

      fetchSalesReport(params, signal)
        .then((result) => {
          setReport(result);
          setError('');
        })
        .catch((err) => {
          if (axios.isCancel(err)) return;
          setError(getApiErrorMessage(err, 'Could not build the report.'));
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, from, to, salesRepId, approvalStatus, categoryId, dateRangeError],
  );

  useEffect(() => {
    if (dateRangeError) return;
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load, dateRangeError]);

  useEffect(() => {
    const controller = new AbortController();

    fetchCategories(controller.signal)
      .then(setCategories)
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  if (!report && !error) {
    return <Spinner />;
  }

  const selectClasses =
    'cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-700 outline-none hover:border-slate-300 focus:border-brand-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales reporting"
        subtitle={report ? `${report.period.label} · ${report.summary.quotations} quotations` : undefined}
        action={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} />
              Print / PDF
            </Button>
            <Button
              loading={exporting}
              onClick={async () => {
                setExporting(true);

                try {
                  await downloadSalesCsv(params);
                } catch (err) {
                  setError(getApiErrorMessage(err, 'The export failed.'));
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={15} />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as SalesReportParams['period'])}
          aria-label="Period"
          className={selectClasses}
        >
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="quarter">Last 90 days</option>
          <option value="custom">Custom range</option>
        </select>

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
              className={`${selectClasses} ${
                dateRangeError ? 'border-red-300 focus:border-red-500' : ''
              }`}
            />
            <span className="text-[13px] text-slate-400">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className={`${selectClasses} ${
                dateRangeError ? 'border-red-300 focus:border-red-500' : ''
              }`}
            />
            {dateRangeError && (
              <span role="alert" className="text-[12px] font-medium text-red-600">
                {dateRangeError}
              </span>
            )}
          </div>
        )}

        <select
          value={salesRepId}
          onChange={(e) => setSalesRepId(e.target.value)}
          aria-label="Sales rep"
          className={selectClasses}
        >
          <option value="">All reps</option>
          {report?.byRep.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name}
            </option>
          ))}
        </select>

        <select
          value={approvalStatus}
          onChange={(e) => setApprovalStatus(e.target.value)}
          aria-label="Approval status"
          className={selectClasses}
        >
          <option value="">Any approval</option>
          <option value="NOT_REQUIRED">Not required</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Product category"
          className={selectClasses}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Pipeline" value={currency.format(report.summary.quotationValue)} note={`${report.summary.quotations} quotations`} />
            <Metric label="Won" value={currency.format(report.summary.wonValue)} note={`${report.summary.won} deals`} tone="green" />
            <Metric
              label="Win rate"
              value={report.summary.winRatePercent === null ? '—' : `${report.summary.winRatePercent}%`}
              note={`${report.summary.lost} lost`}
            />
            <Metric
              label="Avg discount"
              value={`${report.summary.averageDiscountPercent}%`}
              note={`avg deal ${currency.format(report.summary.averageDealSize)}`}
            />
            <Metric label="Orders" value={currency.format(report.summary.orderValue)} note={`${report.summary.orders} orders`} />
            <Metric label="Invoiced" value={currency.format(report.summary.invoiced)} />
            <Metric label="Collected" value={currency.format(report.summary.collected)} tone="green" />
            <Metric
              label="Outstanding"
              value={currency.format(report.summary.outstanding)}
              tone={report.summary.outstanding > 0 ? 'amber' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="By sales rep">
              <Table
                head={['Rep', 'Quotes', 'Won', 'Pipeline', 'Won value']}
                align={['left', 'center', 'center', 'right', 'right']}
                rows={report.byRep.map((rep) => [
                  rep.name,
                  String(rep.quotes),
                  String(rep.won),
                  currency.format(rep.value),
                  currency.format(rep.wonValue),
                ])}
              />
            </Panel>

            <Panel title="By category">
              <Table
                head={['Category', 'Units', 'Revenue', 'Discount']}
                align={['left', 'center', 'right', 'right']}
                rows={report.byCategory.map((row) => [
                  row.name,
                  String(row.units),
                  currency.format(row.revenue),
                  currency.format(row.discount),
                ])}
              />
            </Panel>

            <Panel title="Best selling products">
              <Table
                head={['SKU', 'Product', 'Units', 'Revenue']}
                align={['left', 'left', 'center', 'right']}
                rows={report.byProduct.slice(0, 10).map((row) => [
                  row.sku,
                  row.name,
                  String(row.units),
                  currency.format(row.revenue),
                ])}
              />
            </Panel>

            <Panel title="Most discounted products">
              <Table
                head={['SKU', 'Product', 'Discount', '% off']}
                align={['left', 'left', 'right', 'center']}
                rows={[...report.byProduct]
                  .sort((a, b) => b.discountPercent - a.discountPercent)
                  .slice(0, 10)
                  .map((row) => [
                    row.sku,
                    row.name,
                    currency.format(row.discount),
                    `${row.discountPercent}%`,
                  ])}
              />
            </Panel>
          </div>

          <Panel title="Approval status">
            <Table
              head={['Status', 'Quotations', 'Value']}
              align={['left', 'center', 'right']}
              rows={report.byApproval.map((row) => [
                humanStatus(row.status),
                String(row.count),
                currency.format(row.value),
              ])}
            />
          </Panel>

          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Quotations in this period
            </h2>
            {report.rows.length === 0 ? (
              <EmptyState title="Nothing matches these filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3 font-semibold">Quote</th>
                      <th className="px-3 py-3 font-semibold">Customer</th>
                      <th className="px-3 py-3 font-semibold">Rep</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Approval</th>
                      <th className="px-3 py-3 text-center font-semibold">Risk</th>
                      <th className="px-5 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.slice(0, 50).map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-2.5 text-[13px] font-medium text-slate-900">
                          {row.quoteNumber}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-slate-600">{row.customer}</td>
                        <td className="px-3 py-2.5 text-[13px] text-slate-600">{row.salesRep}</td>
                        <td className="px-3 py-2.5 text-[12px] text-slate-500">
                          {humanStatus(row.status)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            tone={
                              row.approvalStatus === 'APPROVED'
                                ? 'green'
                                : row.approvalStatus === 'PENDING'
                                  ? 'amber'
                                  : row.approvalStatus === 'REJECTED'
                                    ? 'red'
                                    : 'neutral'
                            }
                          >
                            {humanStatus(row.approvalStatus)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center text-[13px] text-slate-600">
                          {row.riskScore ?? '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right text-[13px] font-medium text-slate-900">
                          {currency.format(row.grandTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'green' | 'amber';
}) {
  const tones = { green: 'text-emerald-600', amber: 'text-amber-600' } as const;

  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-1 font-display text-[22px] font-bold ${tone ? tones[tone] : 'text-slate-900'}`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
        {title}
      </h2>
      <div className="overflow-x-auto px-5 py-2">{children}</div>
    </Card>
  );
}

/**
 * Tailwind's compiler only sees class names written out in full, so the
 * alignment is looked up rather than interpolated — `text-${align}` would
 * compile to nothing.
 */
const ALIGN_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

function Table({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: string[][];
  align: ('left' | 'center' | 'right')[];
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-slate-400">No data</p>;
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
          {head.map((cell, index) => (
            <th key={cell} className={`py-2 font-semibold ${ALIGN_CLASSES[align[index] ?? 'left']}`}>
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.join('|')}>
            {row.map((cell, index) => (
              <td
                key={`${cell}-${index}`}
                className={`py-2 text-[13px] text-slate-700 ${ALIGN_CLASSES[align[index] ?? 'left']}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
