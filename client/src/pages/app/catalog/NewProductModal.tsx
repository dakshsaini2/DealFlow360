import { useState } from 'react';
import { Badge, Button, Modal, SelectField, TextField } from '../../../components/ui';
import { currency, marginTone, type Category } from '../../../util/catalog';

export type NewProductInput = {
  sku: string;
  name: string;
  categoryId: string;
  description?: string;
  productType: 'GOODS' | 'SERVICE';
  basePrice: number;
  costPrice?: number;
  unit: string;
  taxRate: number;
};

/**
 * Cost price is optional on the API, but a product without one carries no
 * margin — so the dialog prices the margin live rather than letting an admin
 * discover the gap from a quote weeks later.
 */
export default function NewProductModal({
  categories,
  onClose,
  onSubmit,
}: {
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: NewProductInput) => void;
}) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [productType, setProductType] = useState<'GOODS' | 'SERVICE'>('GOODS');
  const [unit, setUnit] = useState('unit');
  const [basePrice, setBasePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const base = Number(basePrice);
  const cost = costPrice.trim() === '' ? null : Number(costPrice);
  const marginPercent =
    cost === null || !Number.isFinite(base) || !Number.isFinite(cost) || base <= 0
      ? null
      : Math.round(((base - cost) / base) * 1000) / 10;

  const ready =
    sku.trim().length >= 2 &&
    name.trim().length >= 2 &&
    categoryId !== '' &&
    unit.trim() !== '' &&
    Number.isFinite(base) &&
    basePrice.trim() !== '' &&
    base >= 0 &&
    (cost === null || (Number.isFinite(cost) && cost >= 0));

  return (
    <Modal title="New product" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            id="product-sku"
            label="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            placeholder="HW-SRV-1U"
            hint="Must be unique across the catalog."
          />
          <TextField
            id="product-unit"
            label="Sold per"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="unit, seat, license…"
          />
        </div>

        <TextField
          id="product-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rack Server 1U (16-core)"
        />

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            id="product-category"
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            hint={categories.length === 0 ? 'No categories loaded — reload the page.' : undefined}
          >
            {categories.length === 0 && <option value="">No categories available</option>}
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="product-type"
            label="Type"
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'GOODS' | 'SERVICE')}
          >
            <option value="GOODS">Goods</option>
            <option value="SERVICE">Service</option>
          </SelectField>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <TextField
            id="product-base-price"
            label="List price"
            type="number"
            min={0}
            step={0.01}
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="0.00"
          />
          <TextField
            id="product-cost-price"
            label="Cost price"
            type="number"
            min={0}
            step={0.01}
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="Optional"
          />
          <TextField
            id="product-tax-rate"
            label="Tax rate %"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
          {marginPercent === null ? (
            <span className="text-slate-500">
              Without a cost price this product shows no margin, and quantity breaks fall back to
              the flat volume ladder.
            </span>
          ) : (
            <>
              <span>List margin</span>
              <Badge tone={marginTone(marginPercent)}>{marginPercent}%</Badge>
              <span className="text-slate-400">
                {currency.format(base - (cost ?? 0))} per {unit.trim() || 'unit'}
              </span>
            </>
          )}
        </div>

        <TextField
          id="product-description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional. Searched alongside name and SKU."
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!ready}
            onClick={() => {
              setBusy(true);
              onSubmit({
                sku: sku.trim(),
                name: name.trim(),
                categoryId,
                description: description.trim() || undefined,
                productType,
                basePrice: base,
                costPrice: cost ?? undefined,
                unit: unit.trim(),
                taxRate: Number(taxRate) || 0,
              });
            }}
          >
            Create product
          </Button>
        </div>
      </div>
    </Modal>
  );
}
