import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  Button,
  ErrorBanner,
  Modal,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import {
  createCustomer,
  updateCustomer,
  type CustomerDetail,
  type CustomerInput,
  type CustomerSummary,
  type CustomerTier,
} from '../../../util/customers';
import { useAuth } from '../../../hooks/useAuth';
import {
  email,
  maxLength,
  minLength,
  phone,
  required,
  useValidation,
} from '../../../util/validation';

/** Mirrors the Zod bounds the customers API validates against. */
const RULES = {
  name: [required('A company name'), minLength(2, 'A company name'), maxLength(200, 'A company name')],
  email: [email(), maxLength(254, 'The email address')],
  phone: [phone(), maxLength(40, 'A phone number')],
  billingAddress: [maxLength(400, 'The billing address')],
  shippingAddress: [maxLength(400, 'The shipping address')],
};

type FieldName = keyof typeof RULES;

type Props = {
  tiers: CustomerTier[];
  /** Omitted means "create"; supplied means "edit". */
  customer?: CustomerDetail;
  onClose: () => void;
  onSaved: (customer: CustomerSummary) => void;
};

export default function CustomerFormModal({ tiers, customer, onClose, onSaved }: Props) {
  const { hasRole } = useAuth();
  const canAssignTier = hasRole('ADMIN', 'SALES_MANAGER');

  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    billingAddress: customer?.billingAddress ?? '',
    shippingAddress: customer?.shippingAddress ?? '',
    customerTierId: customer?.customerTier?.id ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { errors, validateField, validateAll, clearError } = useValidation<FieldName>(RULES);

  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCopyBillingToShipping() {
    if (!form.billingAddress?.trim()) return;
    set('shippingAddress', form.billingAddress.trim());
    clearError('shippingAddress');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** Text field wiring: clear the error while typing, re-check on blur. */
  function fieldProps(key: FieldName) {
    return {
      error: errors[key],
      onBlur: () => validateField(key, form[key] ?? ''),
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        clearError(key);
        set(key, event.target.value);
      },
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll(form as Partial<Record<FieldName, string>>)) return;

    setSaving(true);

    // The server rejects empty strings for optional fields, and only accepts a
    // tier from a manager or admin — so send just what is allowed and filled.
    const payload: CustomerInput = { name: form.name.trim() };

    for (const key of ['email', 'phone', 'billingAddress', 'shippingAddress'] as const) {
      const value = form[key]?.trim();
      if (value) payload[key] = value;
    }

    if (canAssignTier && form.customerTierId) {
      payload.customerTierId = form.customerTierId;
    }

    try {
      const saved = customer
        ? await updateCustomer(customer.id, payload)
        : await createCustomer(payload);

      onSaved(saved);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save this customer.'));
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose} width="xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5" noValidate>
        {error && <ErrorBanner message={error} />}

        <TextField
          id="customer-name"
          label="Company name"
          placeholder="Northwind Logistics"
          value={form.name}
          disabled={saving}
          required
          {...fieldProps('name')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="customer-email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ap@company.com"
            value={form.email ?? ''}
            disabled={saving}
            {...fieldProps('email')}
          />
          <TextField
            id="customer-phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1-555-0100"
            value={form.phone ?? ''}
            disabled={saving}
            {...fieldProps('phone')}
          />
        </div>

        <SelectField
          id="customer-tier"
          label="Tier"
          value={form.customerTierId ?? ''}
          onChange={(e) => set('customerTierId', e.target.value)}
          disabled={saving || !canAssignTier}
          hint={
            canAssignTier
              ? 'Sets the discount ceiling used when quoting.'
              : 'New accounts start on Standard. Only a manager or admin can change the tier.'
          }
        >
          <option value="">{canAssignTier ? 'Standard (default)' : 'Standard'}</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.name}
              {tier.defaultDiscountCeiling !== null && ` — up to ${tier.defaultDiscountCeiling}% off`}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          id="customer-billing"
          label="Billing address"
          placeholder={'1 Market St\nSuite 400\nSpringfield, IL 62701'}
          rows={4}
          maxLength={400}
          autoComplete="billing street-address"
          value={form.billingAddress ?? ''}
          disabled={saving}
          {...fieldProps('billingAddress')}
        />

        <TextAreaField
          id="customer-shipping"
          label="Shipping address"
          action={
            <button
              type="button"
              id="customer-same-address-btn"
              onClick={handleCopyBillingToShipping}
              disabled={saving || !form.billingAddress?.trim()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 shadow-xs transition-colors hover:border-brand-300 hover:bg-slate-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              title="Copy billing address to shipping address"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-600" />
                  <span className="font-semibold text-emerald-700">Copied from billing!</span>
                </>
              ) : (
                <>
                  <Copy size={13} className="text-brand-600" />
                  <span>Same as billing address</span>
                </>
              )}
            </button>
          }
          placeholder={'Where the goods go, if it differs from billing'}
          rows={4}
          maxLength={400}
          autoComplete="shipping street-address"
          value={form.shippingAddress ?? ''}
          disabled={saving}
          {...fieldProps('shippingAddress')}
        />

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {customer ? 'Save changes' : 'Create customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
