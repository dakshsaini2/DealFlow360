import { api } from './api';

export type FulfillmentStatus =
  | 'PENDING'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type WarehouseRef = { id: string; code: string; name: string };

export type PlannedAllocation = {
  orderLineId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  allocationMethod: string;
};

export type PlannedBackorder = {
  orderLineId: string;
  productId: string;
  variantId: string | null;
  sku: string;
  productName: string;
  quantity: number;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
};

/** What the split engine would do with stock as it stands right now. */
export type AllocationPlan = {
  allocations: PlannedAllocation[];
  backorders: PlannedBackorder[];
  warehousesUsed: {
    id: string;
    code: string;
    name: string;
    shippingCostWeight: number;
    lineCount: number;
    unitCount: number;
  }[];
  shipmentCount: number;
  estimatedShippingCost: number;
  method: string;
  fullyBackordered: boolean;
  explanation: string;
};

export type CommittedAllocation = {
  id: string;
  orderLineId: string;
  warehouseId: string;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  backorderedQuantity: number;
  allocationMethod: string;
  warehouse: WarehouseRef & { shippingCostWeight: number };
  orderLine: {
    id: string;
    quantity: number;
    product: { id: string; sku: string; name: string; unit: string };
    variant: { id: string; sku: string; name: string } | null;
  };
};

export type Backorder = {
  id: string;
  orderLineId: string;
  productId: string;
  quantity: number;
  status: string;
  expectedRestockDate: string | null;
  consolidatedAt: string | null;
  warehouse: WarehouseRef;
  product: { id: string; sku: string; name: string };
};

export type FulfillmentResponse = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    currencyCode: string;
    promisedDeliveryDate: string | null;
    customer: { id: string; name: string; shippingAddress: string | null };
  };
  fulfillment: {
    id: string;
    status: FulfillmentStatus;
    estimatedShipmentCount: number | null;
    estimatedShippingCost: number | null;
    actualShippingCost: number | null;
    expectedShipDate: string | null;
    shippedAt: string | null;
    createdAt: string;
    allocations: CommittedAllocation[];
  } | null;
  backorders: Backorder[];
  /** The committed split once allocated, otherwise what the engine proposes. */
  plan: AllocationPlan;
  /** True while `plan` is still only a proposal. */
  isProposal: boolean;
  nonPhysicalLines: { orderLineId: string; sku: string; name: string; lineType: string }[];
  /** Backorders that stock has since arrived for — drives the consolidate prompt. */
  consolidatable: {
    backorderId: string;
    productId: string;
    backorderedQuantity: number;
    nowAvailable: number;
  }[];
};

export type StockRow = {
  id: string;
  product: { id: string; sku: string; name: string; unit: string };
  variant: { id: string; sku: string; name: string } | null;
  onHandQuantity: number;
  reservedQuantity: number;
  available: number;
  reorderLevel: number;
  belowReorderLevel: boolean;
};

export type WarehouseWithStock = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  shippingCostWeight: number;
  stock: StockRow[];
};

export async function fetchFulfillment(orderId: string, signal?: AbortSignal) {
  const { data } = await api.get<FulfillmentResponse>(`/orders/${orderId}/fulfillment`, { signal });

  return data;
}

export async function acceptSplit(orderId: string) {
  const { data } = await api.post<FulfillmentResponse>(`/orders/${orderId}/fulfillment/accept`, {});

  return data;
}

export async function overrideSplit(
  orderId: string,
  allocations: { orderLineId: string; warehouseId: string; quantity: number }[],
  reason?: string,
) {
  const { data } = await api.post<FulfillmentResponse>(`/orders/${orderId}/fulfillment/override`, {
    allocations,
    reason,
  });

  return data;
}

export async function consolidateBackorders(orderId: string) {
  const { data } = await api.post<FulfillmentResponse>(
    `/orders/${orderId}/fulfillment/consolidate`,
    {},
  );

  return data;
}

export async function shipOrder(orderId: string, actualShippingCost?: number) {
  const { data } = await api.post<FulfillmentResponse>(`/orders/${orderId}/fulfillment/ship`, {
    actualShippingCost,
  });

  return data;
}

export async function fetchWarehouses(params: { orderId?: string } = {}, signal?: AbortSignal) {
  const { data } = await api.get<{ data: WarehouseWithStock[] }>('/warehouses', { params, signal });

  return data.data;
}

/* ── display helpers ────────────────────────────────── */

export const FULFILLMENT_TONE: Record<
  FulfillmentStatus,
  'neutral' | 'brand' | 'green' | 'amber' | 'red'
> = {
  PENDING: 'neutral',
  ALLOCATED: 'brand',
  PICKING: 'brand',
  PACKED: 'brand',
  SHIPPED: 'amber',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export const METHOD_LABELS: Record<string, string> = {
  SINGLE_WAREHOUSE: 'Single warehouse',
  SPLIT: 'Split shipment',
  BACKORDER: 'Backorder',
};
