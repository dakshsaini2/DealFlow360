# DealFlow360

> **Intelligent Enterprise CPQ, Collaborative Sales Operations & Revenue Lifecycle Platform**

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-v19+-61DAFB.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-v5+-lightgrey.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v17+-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-v6+-2D3748.svg)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4+-38B2AC.svg)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-v6+-646CFF.svg)](https://vitejs.dev/)

---

![alt text](image.png)
![alt text](image-1.png)


## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Quick Start (Docker)](#quick-start-docker)
- [Getting Started & Local Setup](#getting-started--local-setup)
- [Seed Dataset & Demo Credentials](#seed-dataset--demo-credentials)

---

## Overview

**DealFlow360** is a full-featured, enterprise-grade Configure-Price-Quote (CPQ) and sales operations platform engineered to manage the entire sales lifecycle—from lead quotation, automated discount governance, and risk-calibrated approvals, to collaborative customer negotiation, multi-depot warehouse fulfillment, hybrid subscription billing, and real-time deal health telemetry.

### Core Problems Solved

1. **Unchecked Margin Erosion:** Sales representatives frequently give steep discounts to close deals quickly, severely damaging corporate profitability. DealFlow360 enforces deterministic category- and tier-based discount ceilings derived from real product margin floors.
2. **Opaque Multi-Item Risk:** Conventional CPQ software either flags only the single worst discount or averages discounts naively. DealFlow360 computes a **Blended Risk Score (0–100)** that evaluates value-weighted discount excess against line totals, isolates catastrophic single-line outliers, and incorporates order-wide gross margin shortfalls.
3. **Approval Bottlenecks:** Safe, high-margin deals shouldn't wait for managerial sign-off. DealFlow360 auto-approves low-risk quotations, routes medium-risk deals to sales managers, and dynamically escalates deep discounts or thin-margin deals to sequential finance committees.
4. **Friction in Customer Negotiation:** Disconnected email chains and PDF markups slow deal velocity. DealFlow360 provides a dedicated, customer-facing portal where buyers can submit structured change requests, line-item comments, or formal counter-offers—with internal seller margins and risk analytics completely redacted.
5. **Physical & Recurring Revenue Disconnect:** Modern B2B transactions often combine physical appliances with monthly software licenses and annual maintenance. DealFlow360 natively supports **Hybrid Orders**, splitting line items into physical warehouse pick/pack orders and automated recurring subscription billing schedules.
6. **Logistical Splitting Costs:** Multi-depot fulfillment often racks up unnecessary parcel fees by naively sourcing lines from disparate depots. DealFlow360's greedy set-cover fulfillment engine minimizes shipment count while factoring in warehouse cost weights, managing backorders, and prompting consolidation upon restock.
7. **Stalled Deal Blindspots:** Sales leadership often discovers lost or stalling deals weeks too late. DealFlow360 computes on-read deal health telemetry and raises automated anomaly alerts for stalled inactivity, excessive discount deviation, delivery slippage, and margin erosion.

---

## System Architecture

```mermaid
graph TB
    subgraph "Frontend Layer (React 19 + Vite + TailwindCSS v4)"
        UI_Internal["Internal Sales Operations Workspace (/app)<br/>• AppShell & Navigation<br/>• Dashboard & KPIs<br/>• Catalog & Quotation Builder<br/>• Multi-Step Approval Queue<br/>• Orders & Fulfillment Splitting<br/>• Subscriptions & Invoicing<br/>• Deal Health & Telemetry<br/>• Admin Control Plane"]
        UI_Portal["Customer Self-Service Portal (/portal)<br/>• Isolated Portal Shell<br/>• Storefront & RFQ Builder<br/>• Quotation Review & Line Comments<br/>• Counter-Offers & Change Requests<br/>• Order Tracking & Invoice History"]
    end

    subgraph "API Gateway & Middleware (Express 5 + TypeScript)"
        AuthGuard["JWT Auth & Role-Based Access Control (RBAC)<br/>ADMIN | SALES_MANAGER | FINANCE | SALES_REP | CUSTOMER"]
        InputVal["Zod Schema Validation & Data Sanitization"]
        Serialization["Decimal to Number Serialization & Error Boundaries"]
    end

    subgraph "Domain Service Modules"
        M_Auth["Auth & Identity<br/>Tokens, Invites, Outbox"]
        M_Catalog["Catalog & Pricing<br/>Tiers, Variants, Uplift"]
        M_Quotes["Quotations & Recalculation<br/>Revisions, State Sync"]
        M_Risk["Blended Risk Engine<br/>Weighted Excess, Margins"]
        M_Approvals["Approval Engine<br/>Multi-Step Chains, Audit"]
        M_Recs["Upsell & Cross-Sell<br/>Graph Engine, Promos"]
        M_Portal["Customer Portal<br/>Redacted Negotiation"]
        M_Orders["Order Operations<br/>Conversion, Line Sync"]
        M_Fulfill["Fulfillment Optimization<br/>Greedy Set-Cover, Stock"]
        M_Billing["Hybrid Billing & Proration<br/>Schedules, Recurring Run"]
        M_Health["Deal Health Telemetry<br/>Anomaly Detection, Alerts"]
        M_Reports["Sales Analytics<br/>Aggregations, CSV Export"]
        M_Admin["Admin Plane<br/>Warehouses, Rules, Settings"]
    end

    subgraph "Persistence & Infrastructure"
        Prisma["Prisma ORM (v6)"]
        Postgres[("PostgreSQL 17 Database<br/>53 Relational Models<br/>UUIDs, Decimal Precision, JSON Logs")]
        Mailer["Nodemailer & Dev Outbox"]
    end

    UI_Internal --> AuthGuard
    UI_Portal --> AuthGuard
    AuthGuard --> InputVal
    InputVal --> Serialization
    Serialization --> M_Auth & M_Catalog & M_Quotes & M_Risk & M_Approvals & M_Recs & M_Portal & M_Orders & M_Fulfill & M_Billing & M_Health & M_Reports & M_Admin
    M_Auth & M_Catalog & M_Quotes & M_Risk & M_Approvals & M_Recs & M_Portal & M_Orders & M_Fulfill & M_Billing & M_Health & M_Reports & M_Admin --> Prisma
    Prisma --> Postgres
    M_Auth -.-> Mailer
```

---

## Quick Start (Docker)

The whole application — database, API and web client — runs from the single
`docker-compose.yml` at the project root. Docker is the only prerequisite; you
do not need Node, npm or Postgres installed.

```bash
docker compose up -d --build
```

Then open **<http://localhost:8080>** and sign in with:

| Email | Password |
|---|---|
| `admin@dealflow360.com` | `password123` |

The first boot takes a couple of minutes while the images build. The server
applies migrations and seeds the demo dataset automatically, so there is nothing
else to run — watch it happen with `docker compose logs -f server`.

Every seeded account (see [Demo Credentials](#pre-configured-demo-accounts))
uses the same password, `password123`.

### Everyday commands

```bash
docker compose logs -f            # follow all services
docker compose ps                 # health of each service
docker compose restart server     # restart just the API
docker compose down               # stop everything (data is kept)
docker compose down -v            # stop and wipe the database
```

### Useful overrides

Set these before `docker compose up`, or put them in a `.env` file next to
`docker-compose.yml`:

| Variable | Default | Purpose |
|---|---|---|
| `WEB_PORT` | `8080` | Port the app is served on |
| `POSTGRES_PORT` | `5432` | Host port for the database |
| `SEED_ON_START` | `true` | Set `false` to stop re-seeding demo data on boot |
| `JWT_SECRET` | dev placeholder | Change before exposing the stack |

---

## Getting Started & Local Setup

> Use this path if you want live reload and are actively developing. For just
> running the app, the [Quick Start](#quick-start-docker) above is simpler.


### Prerequisites

- **Node.js:** v20.x or higher
- **Docker & Docker Compose:** For running the local PostgreSQL 17 database
- **npm:** v10.x or higher

---

### Step 1: Start PostgreSQL Database

Launch only the PostgreSQL 17 service from `docker-compose.yml` — naming the
service keeps the API and web containers out of the way, since you are about to
run those from source:

```bash
# From the project root directory
docker compose up -d postgres
```

Verify that PostgreSQL is running on `localhost:5432`:
```bash
docker compose ps
```

---

### Step 2: Configure & Initialize Server

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Create or verify the `.env` configuration file:
   ```env
   DATABASE_URL="postgresql://odoo:odoo_password@localhost:5432/odoo_db"
   JWT_SECRET="dealflow360-super-secret-key-change-in-prod"
   JWT_EXPIRES_IN="1d"
   PORT=3000
   APP_URL="http://localhost:5173"

   # Leave SMTP_HOST empty to use the built-in dev outbox (/api/dev/outbox)
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=
   SMTP_PASSWORD=
   SMTP_FROM="DealFlow360 <no-reply@dealflow360.com>"
   ```

4. Generate the Prisma Client and apply migrations:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

5. Seed the database with the complete demo dataset:
   ```bash
   npm run seed
   ```

6. Start the backend development server (with live file watching):
   ```bash
   npm run dev
   ```
   *The server will boot on `http://localhost:3000`.*

---

### Step 3: Configure & Start Frontend Client

1. Open a second terminal window and navigate to the `client` directory:
   ```bash
   cd client
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The client will launch at `http://localhost:5173` (proxied to the backend at port 3000).*

4. Open your browser and navigate to `http://localhost:5173`.

---

## Seed Dataset & Demo Credentials

When running `npm run seed`, DealFlow360 populates a complete enterprise environment with 5 users across all roles, 3 customer tiers, 38 products across 6 categories, 3 tier price lists, discount governance rules, risk approval policies, 3 regional warehouses with stock, upsell relationships, subscription plans, active promotions, and 10 demo customers.

### Pre-Configured Demo Accounts

All demo accounts share the password: **`password123`**

| Email | Assigned Roles | Recommended Inspection Scenarios |
|---|---|---|
| `admin@dealflow360.com` | `ADMIN`, `SALES_MANAGER` | System settings, warehouse depots, catalog items, discount rules, approval queues. |
| `manager@dealflow360.com` | `SALES_MANAGER`, `SALES_REP` | Approving medium-risk deals, team quotations, deal health triage, alert escalation. |
| `finance@dealflow360.com` | `FINANCE` | Multi-step high-risk approvals, warehouse overrides, recurring billing runs, invoices & payments. |
| `rep@dealflow360.com` | `SALES_REP` | Creating quotes, testing catalog discounts, accepting predictive upsells, negotiating in portal thread. |
| `rep2@dealflow360.com` | `SALES_REP` | Multi-rep pipeline comparisons, leaderboard testing, deal health anomaly triggers. |
| `customer@dealflow360.com` | `CUSTOMER` | Customer portal experience: storefront RFQs, commenting on lines, submitting counter-offers, order tracking. |

---

## License

This project is licensed under the ISC License.
