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

Signup and login return `{ token, user: { id, email, firstName, lastName, roles } }`.
Emails are normalized (trimmed + lowercased) and passwords must be at least 8
characters.

## Roles

`ADMIN`, `SALES_MANAGER`, `SALES_REP`, `CUSTOMER` — defined once in
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
rules, three risk-banded approval policies, three warehouses with stock, upsell
relationships and ten customers. Every write is an upsert on a natural key, so
it is safe to re-run.

All demo users share the password `password123`:

| Email | Roles |
| --- | --- |
| `admin@dealflow360.com` | ADMIN, SALES_MANAGER |
| `manager@dealflow360.com` | SALES_MANAGER, SALES_REP |
| `rep@dealflow360.com` | SALES_REP |
| `rep2@dealflow360.com` | SALES_REP |
| `customer@dealflow360.com` | CUSTOMER |
