# Server source layout

```
src/
├── index.ts                  app wiring: json parser, routes, 404 + error handlers
├── common/                   cross-module building blocks
│   ├── constants/            allowed values for the schema's String status columns
│   ├── errors/               AppError (base) + AuthError family
│   ├── middleware/           requireAuth / requireRole / currentUser, notFound + error handlers
│   ├── types/                JwtPayload, UserRole, Express Request augmentation
│   └── utils/                env, prisma, password + token, validate, serialize, pagination
└── modules/
    ├── auth/                 routes → controller → service → prisma
    ├── catalog/              products, categories and the pricing engine
    ├── customers/            accounts, tiers and deal history
    └── dashboard/            role-scoped summary counters
```

## Layers

| File | Responsibility |
| --- | --- |
| `auth.routes.ts` | URL → middleware → controller wiring only |
| `auth.controller.ts` | Parses the request, calls the service, shapes the response, forwards errors to `next` |
| `auth.service.ts` | Business rules and persistence; throws domain errors, never touches `req`/`res` |
| `auth.types.ts` | Zod schemas (`loginSchema`, `signupSchema`) and DTOs (`AuthResult`, `PublicUser`) |

No handler writes an error response itself. Everything throws an `AppError`
subclass and `errorHandler` turns it into `{ error: { code, message, details? } }`
with the right status. Unknown errors are logged and become a generic 500
(the message is only echoed outside production).

## Endpoints

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | – |
| `POST` | `/api/auth/signup` | – | `{ email, password, firstName, lastName, role? }` |
| `POST` | `/api/auth/login` | – | `{ email, password }` |
| `GET` | `/api/auth/me` | Bearer | – |
| `GET` | `/api/dashboard/summary` | Bearer | – |
| `GET` | `/api/customers` | Bearer | `?q&tierId&status&sort&page&pageSize` |
| `GET` | `/api/customers/tiers` | Bearer | – |
| `GET` | `/api/customers/:id` | Bearer | – |
| `POST` | `/api/customers` | Rep+ | `{ name, email?, phone?, …, customerTierId? }` |
| `PATCH` | `/api/customers/:id` | Rep+ | any subset of the create body, plus `isActive` |
| `GET` | `/api/catalog/products` | Bearer | `?q&categoryId&productType&status&sort&recurringOnly&page&pageSize` |
| `GET` | `/api/catalog/products/:id` | Bearer | – |
| `GET` | `/api/catalog/categories` | Bearer | – |
| `POST` | `/api/catalog/pricing/resolve` | Bearer | `{ customerId \| customerTierId, currencyCode?, lines[] }` |

Signup and login return `{ token, user: { id, email, firstName, lastName, roles } }`.
Emails are normalized (trimmed + lowercased) and passwords must be at least 8
characters.

## Roles

`ADMIN`, `SALES_MANAGER`, `FINANCE`, `SALES_REP`, `CUSTOMER` — defined once in
`common/types/auth.types.ts`. A user may hold several, so the JWT carries
`roles: UserRole[]` and `requireRole(...)` passes when the caller holds **any**
of the listed roles. These same strings are what `ApprovalStep.role` stores, so
an approval policy names an approver group directly. Self-signup may only claim
`SALES_REP` (the default) or `CUSTOMER`.

Customer visibility: internal roles share one book of business; a `CUSTOMER`
sees only the accounts they are linked to through `CustomerUser`. Setting
`customerTierId` or `isActive` is restricted to `ADMIN` / `SALES_MANAGER`,
because the tier decides the discount ceiling a quote is checked against — a
rep's new accounts land on `Standard`.

## Pricing

`catalog/pricing.service.ts` is the only place a price or a discount ceiling is
decided. The quote builder, the upsell panel and the approval engine all read
their numbers from it, so they cannot disagree.

**Unit price** — the customer's tier price list (matching currency, inside its
validity window, narrowest quantity band, variant row beating the product-wide
one) falls back to `Product.basePrice` plus any variant uplift. The response
says which was used via `priceSource`.

**Discount ceiling** — a `DiscountRule` for the tier *and* the product's
category wins; then a tier-wide rule; then `CustomerTier.defaultDiscountCeiling`;
otherwise zero, so an untiered customer cannot be discounted at all. Reported
as `ceilingSource`. This per-category ceiling is what makes "hardware may go to
15% but services only to 10%" work inside one quote, and `discountExcessPercent`
per line is the input the blended risk score will aggregate.

Seeded ceilings are derived from each category's **worst-margin** product — the
largest discount that still leaves ~8% margin after the tier's price list is
applied. Using the worst case rather than the average is what makes the ceiling
a guarantee: no product can be sold below the floor while staying within its
limit. `marginPercentAtCeiling` on every line makes that visible.

## Conventions

- **Validation** — every handler runs its input through `validate(schema, body)`
  (`common/utils/validate.ts`), which turns a Zod failure into `ValidationError`.
- **Money** — Prisma returns `Decimal`, which `JSON.stringify` renders as a
  string. Pass responses through `serialize()` (`common/utils/serialize.ts`) so
  the client always receives plain numbers and ISO dates.
- **Statuses** — the schema types every status as `String`. Import the allowed
  values from `common/constants/status.ts` instead of writing a literal.
- **Lists** — use `parsePageParams(req.query)` + `paginated(rows, total, params)`
  from `common/utils/pagination.ts`.
- **Audit** — the spec requires every approval, rejection and edit to be logged
  with actor, timestamp and reason. Call `recordAudit()`
  (`common/utils/audit.ts`) after the change commits; it never throws.
- **Thresholds** — values the spec calls "configured" (stalled-deal days,
  anomaly multiplier, approval risk threshold) live in `SystemSetting`. Read
  them with `getNumericSetting()` (`common/utils/settings.ts`), never a literal.

## Environment

`DATABASE_URL` and `JWT_SECRET` are required at boot; `PORT` (3000),
`JWT_EXPIRES_IN` (`1d`) and `BCRYPT_SALT_ROUNDS` (10) have defaults.
All of them are read once in `common/utils/env.ts` — read config from there,
not from `process.env`.

Run `npx prisma generate` after changing `prisma/schema.prisma`; the client is
emitted to `src/generated/prisma` and is not committed.

## Seed data

`npm run seed` loads a full demo dataset — roles, five users, three customer
tiers, 38 products across six categories, a price list per tier, discount
rules, three risk-banded approval policies (auto / manager / manager+finance),
three warehouses with stock, upsell relationships, three subscription plans,
three promotions, tunable thresholds and ten customers. Every write is an
upsert on a natural key, so it is safe to re-run.

All demo users share the password `password123`:

| Email | Roles |
| --- | --- |
| `admin@dealflow360.com` | ADMIN, SALES_MANAGER |
| `manager@dealflow360.com` | SALES_MANAGER, SALES_REP |
| `finance@dealflow360.com` | FINANCE |
| `rep@dealflow360.com` | SALES_REP |
| `rep2@dealflow360.com` | SALES_REP |
| `customer@dealflow360.com` | CUSTOMER |
