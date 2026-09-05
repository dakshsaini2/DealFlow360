# DealFlow360 Database

Prisma/PostgreSQL data model for **DealFlow360**, an intelligent sales operations platform.

The schema contains **52 relational Prisma models** covering the complete sales lifecycle:

```text
Authentication
    ↓
Customers
    ↓
Products & Pricing
    ↓
Quotation
    ↓
Discount Governance & Approval
    ↓
Customer Negotiation
    ↓
Order
    ↓
Warehouse Fulfillment
    ↓
Subscription / Billing
    ↓
Invoices & Payments
    ↓
Deal Health & Audit
```

## Tech Stack

- **Database:** PostgreSQL
- **ORM:** Prisma
- **Schema:** `schema.prisma`
- **IDs:** UUID
- **Money / percentages:** Prisma `Decimal`
- **Flexible historical data:** Prisma `Json`

## Model Groups

### 1. Identity & Access

| Model | Purpose |
|---|---|
| `User` | Stores internal and portal users. |
| `Role` | Defines application roles. |
| `UserRole` | Many-to-many user/role mapping. |
| `Team` | Sales teams and managers. |
| `TeamMember` | Associates users with teams. |

### 2. Customers

| Model | Purpose |
|---|---|
| `Customer` | B2B customer/company record. |
| `CustomerUser` | Connects portal users to customers. |
| `CustomerTier` | Bronze/Silver/Gold-style customer tiers and default discount ceilings. |

### 3. Products & Pricing

| Model | Purpose |
|---|---|
| `Category` | Product categorization and hierarchy. |
| `Product` | Product/service master record. |
| `ProductVariant` | Product variations such as size or pack. |
| `Attribute` | Variant attributes such as Size or RAM. |
| `AttributeValue` | Possible values for an attribute. |
| `VariantAttributeValue` | Connects variants with attribute values. |
| `PriceList` | Customer-tier/currency-specific price list. |
| `PriceListItem` | Product/variant pricing inside a price list. |

### 4. Discount & Approval

| Model | Purpose |
|---|---|
| `DiscountRule` | Maximum permitted discount by customer tier/category. |
| `ApprovalPolicy` | Maps risk ranges to approval requirements. |
| `ApprovalStep` | Defines ordered approval levels. |
| `ApprovalInstance` | One actual approval workflow for a quotation. |
| `ApprovalAction` | Stores approve/reject/return decisions. |

### 5. Quotations

| Model | Purpose |
|---|---|
| `Quotation` | Main deal/quotation record. |
| `QuoteLine` | Individual products/services in a quotation. |
| `QuoteRevision` | Historical versions of a quotation. |

### 6. Customer Negotiation

| Model | Purpose |
|---|---|
| `ChangeRequest` | Customer requests to modify quote terms. |
| `LineComment` | Line-level customer/internal comments. |
| `CounterOffer` | Customer-proposed alternative discount/terms. |

### 7. Upsell / Cross-sell

| Model | Purpose |
|---|---|
| `ProductRelationship` | Product pairings for upsell/cross-sell. |
| `Promotion` | Active promotions. |
| `PromotionProduct` | Associates products with promotions. |
| `RecommendationEvent` | Tracks recommendation display and user action. |

### 8. Orders

| Model | Purpose |
|---|---|
| `Order` | Confirmed sale generated from a quotation. |
| `OrderLine` | Items belonging to an order. |

### 9. Warehouse & Fulfillment

| Model | Purpose |
|---|---|
| `Warehouse` | Physical warehouse/depot. |
| `Inventory` | Stock by warehouse/product/variant. |
| `ReplenishmentRule` | Restocking configuration. |
| `FulfillmentOrder` | Fulfillment process for an order. |
| `FulfillmentAllocation` | Splits order quantities across warehouses. |
| `Backorder` | Tracks unavailable quantities awaiting fulfillment. |

### 10. Subscription & Recurring Billing

| Model | Purpose |
|---|---|
| `SubscriptionPlan` | Monthly/quarterly/yearly recurring plans. |
| `ProductSubscriptionPlan` | Products supported by a subscription plan. |
| `Subscription` | Customer's active subscription. |
| `SubscriptionLine` | Recurring items within a subscription. |
| `BillingSchedule` | Upcoming recurring billing events. |
| `ProrationEvent` | Records mid-cycle billing adjustments. |

### 11. Invoicing & Payments

| Model | Purpose |
|---|---|
| `Invoice` | Bill generated for an order/subscription. |
| `InvoiceLine` | Individual invoice items. |
| `Payment` | Payment transactions against invoices. |
| `CreditNote` | Partial refund/credit records. |

### 12. Analytics & Audit

| Model | Purpose |
|---|---|
| `DealHealth` | Current health/risk state of a quotation. |
| `AnomalyAlert` | Stalled-deal, discount, fulfillment, or other warnings. |
| `AuditLog` | Historical record of important user/system actions. |

## Core Relationships

```text
User
 ├── Roles
 ├── Teams
 ├── Quotations
 ├── Approval Actions
 └── Audit Logs

Customer
 ├── Customer Users
 ├── Customer Tier
 └── Quotations
       │
       ├── Quote Lines
       │      └── Products
       │
       ├── Approval Instances
       │      └── Approval Actions
       │
       ├── Negotiation
       │
       └── Order
              ├── Order Lines
              ├── Fulfillment
              │     ├── Inventory
              │     ├── Warehouse Allocations
              │     └── Backorders
              │
              └── Billing
                    ├── Subscriptions
                    ├── Billing Schedules
                    ├── Invoices
                    ├── Payments
                    └── Credit Notes
```

## Important Design Rules

### Quotation is separate from Order

A quotation is a negotiable sales document. Once the customer confirms the final terms, an order is created.

```text
Quotation
   ↓
Approval / Negotiation
   ↓
Confirmed
   ↓
Order
```

### Quote lines preserve pricing context

`QuoteLine` stores the price, discount, allowed discount, margin and other values used when the quotation was created. This prevents later price-rule changes from silently changing an existing deal.

### Discount governance is line-aware

The platform must evaluate individual line discount limits and the overall quotation risk.

```text
Customer Tier
      +
Product Category
      +
Discount Rule
      ↓
Quote Line Discount Check
      ↓
Blended Risk Score
      ↓
Approval Routing
```

### One order can contain two billing types

`OrderLine.lineType` distinguishes one-time and recurring items.

```text
Order
 ├── One-time product
 └── Recurring subscription
```

### Warehouse allocation is separate from order lines

An order line can be fulfilled by multiple warehouses.

```text
Order Line: 10 units

Warehouse A → 6
Warehouse B → 4
```

This is handled through `FulfillmentAllocation`.

### Auditability

Important actions should be recorded in `AuditLog`, including:

- quotation edits
- discount changes
- approvals/rejections
- negotiation actions
- fulfillment overrides
- billing-related actions

## Recommended Status Values

The schema currently uses `String` fields for workflow statuses so that the application layer can evolve them without repeated Prisma migrations.

Typical quotation statuses:

```text
DRAFT
PENDING_APPROVAL
APPROVED
SENT
UNDER_NEGOTIATION
CONFIRMED
REJECTED
CANCELLED
EXPIRED
```

Typical approval statuses:

```text
PENDING
APPROVED
REJECTED
RETURNED
CANCELLED
```

Typical fulfillment statuses:

```text
PENDING
PARTIALLY_FULFILLED
FULFILLED
BACKORDERED
CANCELLED
```

Typical invoice statuses:

```text
DRAFT
ISSUED
PARTIALLY_PAID
PAID
OVERDUE
VOID
```

## Business Logic Location

The database stores configuration and transactional state. Core business rules should be implemented in the TypeScript backend/service layer.

Examples:

```text
Discount governance
Approval routing
Blended risk calculation
Warehouse split optimization
Upsell/cross-sell ranking
Subscription proration
Deal-health calculation
Anomaly detection
```

## Prisma Commands

Install Prisma:

```bash
npm install prisma @prisma/client
```

Initialize Prisma:

```bash
npx prisma init
```

Validate the schema:

```bash
npx prisma validate
```

Create and apply a migration:

```bash
npx prisma migrate dev --name init
```

Generate Prisma Client:

```bash
npx prisma generate
```

Open Prisma Studio:

```bash
npx prisma studio
```

## Environment Variable

Create `.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dealflow360"
```

## Model Count

**52 Prisma models**

```text
1–5    Identity & Teams
6–8    Customers
9–16   Products & Pricing
17–19  Discount & Approval Configuration
20–24  Quotations & Approval Execution
25–27  Negotiation
28–31  Upsell / Cross-sell
32–33  Orders
34–39  Warehouse & Fulfillment
40–45  Subscription & Billing Schedule
46–49  Invoicing & Payments
50–52 Analytics & Audit
```

## Implementation Order

For development, create and seed data in this approximate order:

```text
1. User / Role / Team
2. Customer / CustomerTier
3. Category / Product / Variant
4. PriceList / PriceListItem
5. DiscountRule
6. ApprovalPolicy / ApprovalStep
7. Quotation / QuoteLine
8. ApprovalInstance / ApprovalAction
9. Negotiation
10. Order / OrderLine
11. Warehouse / Inventory / Fulfillment
12. Subscription / Billing
13. Invoice / Payment
14. DealHealth / AnomalyAlert
15. AuditLog
```

This ordering follows the project's end-to-end sales flow and minimizes dependency problems during seeding and development.
