import { useState, type FormEvent } from 'react';
import {
  Button,
  ErrorBanner,
  Modal,
  SelectField,
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

  function set<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name?.trim()) {
      return setError('Please enter a company name.');
    }

    setError('');
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
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5" noValidate>
        {error && <ErrorBanner message={error} />}

        <TextField
          id="customer-name"
          label="Company name"
          placeholder="Northwind Logistics"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={saving}
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="customer-email"
            label="Email"
            type="email"
            placeholder="ap@company.com"
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
            disabled={saving}
          />
          <TextField
            id="customer-phone"
            label="Phone"
            placeholder="+1-555-0100"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            disabled={saving}
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

        <TextField
          id="customer-billing"
          label="Billing address"
          placeholder="1 Market St, Springfield"
          value={form.billingAddress ?? ''}
          onChange={(e) => set('billingAddress', e.target.value)}
          disabled={saving}
        />

        <TextField
          id="customer-shipping"
          label="Shipping address"
          placeholder="1 Market St, Springfield"
          value={form.shippingAddress ?? ''}
          onChange={(e) => set('shippingAddress', e.target.value)}
          disabled={saving}
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
