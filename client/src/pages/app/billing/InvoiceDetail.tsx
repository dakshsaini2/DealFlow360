import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, ReceiptText } from 'lucide-react';
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
import { currency } from '../../../util/catalog';
import { humanStatus } from '../../../util/quotations';
import { useAuth } from '../../../hooks/useAuth';
import {
  INVOICE_TONE,
  PAYMENT_METHODS,
  fetchInvoice,
  recordPayment,
  type InvoiceDetail as Invoice,
  type PaymentMethod,
} from '../../../util/billing';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    fetchInvoice(id, controller.signal)
      .then(setInvoice)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(err, 'Could not load this invoice.'));
      });

    return () => controller.abort();
  }, [id]);

  if (error && !invoice) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!invoice || !id) {
    return <Spinner />;
  }

  const canPay =
    hasRole('ADMIN', 'SALES_MANAGER', 'FINANCE') &&
    invoice.amountDue > 0 &&
    invoice.status !== 'VOID';

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={`${invoice.customer.name} · issued ${new Date(invoice.issuedAt).toLocaleDateString()}`}
        action={
          canPay ? (
            <Button onClick={() => setPaying(true)}>
              <Banknote size={15} />
              Record payment
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={INVOICE_TONE[invoice.status]}>{humanStatus(invoice.status)}</Badge>
        <Badge tone={invoice.invoiceType === 'RECURRING' ? 'brand' : 'neutral'}>
          {invoice.invoiceType === 'RECURRING' ? 'recurring period' : 'one-time sale'}
        </Badge>
        {invoice.dueAt && <Badge>due {new Date(invoice.dueAt).toLocaleDateString()}</Badge>}
        {invoice.order && (
          <Link
            to={`/app/orders/${invoice.order.id}`}
            className="text-[12px] font-medium text-brand-600 no-underline hover:underline"
          >
            {invoice.order.orderNumber}
          </Link>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              <ReceiptText size={15} className="text-slate-400" />
              Lines
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-3 py-3 text-center font-semibold">Qty</th>
                    <th className="px-3 py-3 text-right font-semibold">Unit</th>
                    <th className="px-3 py-3 text-right font-semibold">Tax</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-medium text-slate-900">
                          {line.description ??
                            line.orderLine?.product.name ??
                            line.subscriptionLine?.product.name ??
                            'Line'}
                        </p>
                        {line.periodStart && line.periodEnd && (
                          <p className="text-[11px] text-slate-400">
                            service period {new Date(line.periodStart).toLocaleDateString()} –{' '}
                            {new Date(line.periodEnd).toLocaleDateString()}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-[13px] text-slate-700">
                        {line.quantity}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] text-slate-700">
                        {currency.format(line.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] text-slate-500">
                        {currency.format(line.taxAmount)}
                      </td>
                      <td className="px-5 py-3 text-right text-[14px] font-medium text-slate-900">
                        {currency.format(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {invoice.payments.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Payments
              </h2>
              <ul className="divide-y divide-slate-100">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">
                        {PAYMENT_METHODS.find((entry) => entry.value === payment.paymentMethod)
                          ?.label ?? payment.paymentMethod}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : '—'}
                        {payment.transactionReference ? ` · ${payment.transactionReference}` : ''}
                      </p>
                    </div>
                    <p className="text-[14px] font-semibold text-emerald-700">
                      {currency.format(payment.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {invoice.creditNotes.length > 0 && (
            <Card>
              <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
                Credit notes
              </h2>
              <ul className="divide-y divide-slate-100">
                {invoice.creditNotes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">
                        {note.creditNoteNumber}
                      </p>
                      <p className="text-[11px] text-slate-400">{note.reason}</p>
                    </div>
                    <p className="text-[14px] font-semibold text-slate-700">
                      − {currency.format(note.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="border-b border-slate-100 px-5 py-4 text-[15px] font-semibold text-slate-900">
              Balance
            </h2>
            <dl className="flex flex-col gap-2.5 p-5">
              <Row label="Subtotal" value={currency.format(invoice.subtotal)} />
              <Row label="Discount" value={`− ${currency.format(invoice.discountTotal)}`} />
              <Row label="Tax" value={currency.format(invoice.taxTotal)} />
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Invoice total" value={currency.format(invoice.grandTotal)} strong />
              </div>
              <Row label="Paid" value={currency.format(invoice.amountPaid)} />
              <div className="border-t border-slate-100 pt-2.5">
                <Row label="Outstanding" value={currency.format(invoice.amountDue)} strong />
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {paying && (
        <PaymentDialog
          amountDue={invoice.amountDue}
          onClose={() => setPaying(false)}
          onSubmit={async (input) => {
            try {
              setInvoice(await recordPayment(id, input));
              setPaying(false);
            } catch (err) {
              setError(getApiErrorMessage(err, 'That payment could not be recorded.'));
              setPaying(false);
            }
          }}
        />
      )}
    </div>
  );
}

function PaymentDialog({
  amountDue,
  onClose,
  onSubmit,
}: {
  amountDue: number;
  onClose: () => void;
  onSubmit: (input: {
    amount: number;
    paymentMethod: PaymentMethod;
    transactionReference?: string;
  }) => void;
}) {
  // Defaulting to the full outstanding balance is what happens most of the time.
  const [amount, setAmount] = useState(String(amountDue));
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= amountDue + 0.005;

  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          id="payment-amount"
          label="Amount"
          type="number"
          min={0}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`${currency.format(amountDue)} outstanding`}
        />

        <SelectField
          id="payment-method"
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectField>

        <TextField
          id="payment-reference"
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Bank or transaction reference"
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={() => {
              setBusy(true);
              onSubmit({
                amount: value,
                paymentMethod: method,
                transactionReference: reference.trim() || undefined,
              });
            }}
          >
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/invoices"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline hover:text-slate-900"
    >
      <ArrowLeft size={15} />
      All invoices
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'text-[14px] font-semibold text-slate-900' : 'text-[13px] text-slate-500'}>
        {label}
      </dt>
      <dd
        className={
          strong ? 'font-display text-[18px] font-bold text-slate-900' : 'text-[14px] text-slate-700'
        }
      >
        {value}
      </dd>
    </div>
  );
}
