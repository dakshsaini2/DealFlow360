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
- [End-to-End Sales Lifecycle](#end-to-end-sales-lifecycle)
- [Comprehensive Feature Breakdown](#comprehensive-feature-breakdown)
  - [1. Identity, Access & Role-Based Governance (RBAC)](#1-identity-access--role-based-governance-rbac)
  - [2. Customer & Account Tier Management](#2-customer--account-tier-management)
  - [3. Product Master Catalog & Multi-Tier Pricing Engine](#3-product-master-catalog--multi-tier-pricing-engine)
  - [4. Discount Governance & Blended Risk Engine](#4-discount-governance--blended-risk-engine)
  - [5. Dynamic Multi-Level Approval Engine](#5-dynamic-multi-level-approval-engine)
  - [6. Predictive Upsell, Cross-Sell & Promotion Recommendations](#6-predictive-upsell-cross-sell--promotion-recommendations)
  - [7. Customer Portal & Collaborative Negotiation Threads](#7-customer-portal--collaborative-negotiation-threads)
  - [8. Order Lifecycle & Immutable State Transition](#8-order-lifecycle--immutable-state-transition)
  - [9. Warehouse Split Allocation & Fulfillment Optimization](#9-warehouse-split-allocation--fulfillment-optimization)
  - [10. Hybrid Billing & Recurring Subscription Management](#10-hybrid-billing--recurring-subscription-management)
  - [11. Invoicing, Multi-Method Payments & Credit Notes](#11-invoicing-multi-method-payments--credit-notes)
  - [12. Deal Health Telemetry & Proactive Anomaly Detection](#12-deal-health-telemetry--proactive-anomaly-detection)
  - [13. Executive Analytics, Reporting & CSV Export](#13-executive-analytics-reporting--csv-export)
  - [14. Immutable Audit Logging & Compliance](#14-immutable-audit-logging--compliance)
  - [15. System Settings & Developer Affordances](#15-system-settings--developer-affordances)
- [Detailed Process Flows (Mermaid.js)](#detailed-process-flows-mermaidjs)
  - [Flow 1: End-to-End Deal Progression (Quote-to-Cash)](#flow-1-end-to-end-deal-progression-quote-to-cash)
  - [Flow 2: Dynamic Pricing & Blended Risk Evaluation](#flow-2-dynamic-pricing--blended-risk-evaluation)
  - [Flow 3: Risk-Based Approval & Revision State Machine](#flow-3-risk-based-approval--revision-state-machine)
  - [Flow 4: Bidirectional Customer Negotiation Sequence](#flow-4-bidirectional-customer-negotiation-sequence)
  - [Flow 5: Greedy Set-Cover Warehouse Allocation & Restock Consolidation](#flow-5-greedy-set-cover-warehouse-allocation--restock-consolidation)
  - [Flow 6: Hybrid Billing, Recurring Schedules & Mid-Cycle Proration](#flow-6-hybrid-billing-recurring-schedules--mid-cycle-proration)
  - [Flow 7: Deal Health Telemetry & Anomaly Detection Pipeline](#flow-7-deal-health-telemetry--anomaly-detection-pipeline)
- [Database Schema & Domain Models](#database-schema--domain-models)
- [API Reference Matrix](#api-reference-matrix)
- [Directory Structure](#directory-structure)
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

## End-to-End Sales Lifecycle

```mermaid
flowchart TD
    Start(["Sales Opportunity Initiated"]) --> CreateQuote["Sales Rep Creates Quotation"]
    CreateQuote --> AddLines["Add Products / Services / Variants to Quote"]
    
    subgraph "Deterministic Pricing & Risk"
        AddLines --> ResolvePrice["Resolve Customer Tier Price List"]
        ResolvePrice --> CheckCeiling["Evaluate Category Discount Ceiling"]
        CheckCeiling --> CalcMargin["Compute Line Cost & Margin Floor"]
        CalcMargin --> RunRisk["Calculate Blended Risk Score (0-100)<br/>Max(Weighted Excess, Single Worst Line, Margin Shortfall)"]
    end

    subgraph "Approval Routing"
        RunRisk --> RiskDecision{"Risk Score Band?"}
        RiskDecision -- "Score < 25 (Low)" --> AutoApprove["Auto-Approved (No Manual Sign-Off)"]
        RiskDecision -- "25 <= Score < 60 (Medium)" --> MgrApproval["Pending Sales Manager Approval"]
        RiskDecision -- "Score >= 60 (High)" --> MultiApproval["Sequential Approval: Sales Manager THEN Finance"]
        MgrApproval --> ApproverAction{"Manager Decision"}
        MultiApproval --> ApproverAction
        ApproverAction -- "Approved" --> SendQuote["Quotation Approved for Customer"]
        ApproverAction -- "Returned / Rejected" --> RepAdjust["Rep Adjusts Terms or Discounts"]
        RepAdjust --> RunRisk
    end

    AutoApprove --> SendQuote
    SendQuote --> CustomerPortal["Quotation Published to Customer Portal"]

    subgraph "Collaborative Customer Portal"
        CustomerPortal --> CustAction{"Customer Review Action"}
        CustAction -- "Comment on Line Item" --> InternalChat["Negotiation Thread Active"]
        CustAction -- "Request Scope / Terms Change" --> ChangeReq["Submit Formal Change Request"]
        CustAction -- "Propose Counter-Offer" --> Counter["Submit Target Discount / Total"]
        CustAction -- "Accept As Is" --> ConfirmedDeal["Customer Electronically Confirms Quote"]
        ChangeReq & Counter --> RepReview["Sales Rep Reviews in Negotiation Panel"]
        RepReview -- "Accept / Modify Terms" --> CreateRevision["Snapshot QuoteRevision & Recalculate"]
        CreateRevision --> RunRisk
    end

    ConfirmedDeal --> OrderConversion["Convert Quotation to Confirmed Order"]

    subgraph "Fulfillment & Billing Branching"
        OrderConversion --> OrderSplit{"Order Line Types"}
        
        OrderSplit -- "Physical Goods (GOODS)" --> FulfillmentRouting["Greedy Set-Cover Allocation"]
        FulfillmentRouting --> StockCheck{"Sufficient Stock Across Depots?"}
        StockCheck -- "Full Stock" --> SingleOrSplit["Allocate to Optimal Depots (Single / Split)"]
        StockCheck -- "Shortage" --> CreateBackorder["Allocate Available + Park Backorder at Cheapest Hub"]
        SingleOrSplit & CreateBackorder --> DispatchShipment["Pick, Pack & Ship Order"]
        CreateBackorder -.-> RestockEvent["Stock Arrives -> Prompt Backorder Consolidation"]
        RestockEvent --> DispatchShipment

        OrderSplit -- "Recurring Services (SERVICE)" --> SubscriptionInit["Generate Active Subscriptions & Plans"]
        SubscriptionInit --> ScheduleGen["Generate Periodic Billing Schedules (Monthly/Quarterly/Annual)"]
        ScheduleGen --> RecurringEngine["Automated Recurring Billing Runner"]
    end

    DispatchShipment --> IssueInvoice["Generate Final Order Invoice"]
    RecurringEngine --> IssueInvoice
    IssueInvoice --> RecordPayment["Capture Payment (Card, Wire, ACH)"]
    RecordPayment --> Reconciliation["Reconcile Accounts & Deal Closure"]

    subgraph "Continuous Intelligence"
        CreateQuote -.-> Telemetry["Deal Health Telemetry & Anomaly Radar"]
        ConfirmedDeal -.-> Telemetry
        Telemetry --> Alerts["Flags Stalled Deals, Excessive Discounts, Slippage & Margin Erosion"]
    end
```

---

## Comprehensive Feature Breakdown

### 1. Identity, Access & Role-Based Governance (RBAC)

DealFlow360 implements strict multi-role RBAC across five primary roles:

| Role | Target Persona | Operational Capabilities |
|---|---|---|
| `ADMIN` | System Administrator | Full catalog master maintenance, warehouse depot configuration, subscription plan definitions, system threshold calibration, full audit oversight. |
| `SALES_MANAGER` | VP / Sales Director | Team assignment, customer tier adjustments, discount governance ceiling configuration, approval queue escalation, deal health triage. |
| `FINANCE` | CFO / Controller | High-risk quote approvals, order cancellations, warehouse fulfillment overrides, recurring billing runs, invoice reconciliation, credit notes. |
| `SALES_REP` | Account Executive | Account creation, quote drafting, catalog resolution, dynamic upsell acceptance, negotiation thread management, deal execution. |
| `CUSTOMER` | B2B Buyer / Procurement | Restricted customer portal access: browse tier catalog, submit RFQs, review sent quotations, negotiate terms, accept orders, track shipments. |

- **Multi-Role JWTs:** Users can hold multiple roles simultaneously (e.g., `SALES_MANAGER` + `SALES_REP`).
- **User Invitation Pipeline:** Internal sales reps generate secure, signed portal invitations (`PortalInvite`) allowing corporate buyers to claim customer portal accounts.
- **Verification & Security:** BCrypt password hashing (10 salt rounds), email verification tokens, session invalidation, and comprehensive request context augmentation.
- **Developer Outbox:** When running without external SMTP credentials, verification links and reset codes are safely routed to an in-memory development outbox (`/api/dev/outbox`) to prevent deployment mail leaks.

### 2. Customer & Account Tier Management

- **Hierarchical Tiering:** Customers are categorized into structured tiers (`Standard`, `Premium`, `Enterprise`) that determine base pricing multipliers and discount allowances.
- **Default Discount Ceilings:** Every tier defines a default discount ceiling (e.g., Standard: 10%, Premium: 20%, Enterprise: 35%).
- **Multi-Contact Mapping:** A corporate customer record (`Customer`) connects to multiple authenticated portal users (`CustomerUser`), identifying primary billing contacts and procurement officers.
- **Audited Ownership:** Customers are tied to sales representatives and teams, guaranteeing scoped book-of-business visibility.

### 3. Product Master Catalog & Multi-Tier Pricing Engine

- **Categorization & Product Types:** Organizes products into categories (Hardware, Software Licenses, Networking, Peripherals, Support Services, Cloud Services) and distinguishes physical `GOODS` from recurring or engagement `SERVICE` products.
- **Multi-Attribute Product Variants:** Supports configurable attributes (e.g., Storage Capacity, RAM, Form Factor) with variant-level SKU identification and price uplift.
- **Deterministic Pricing Resolution (`pricing.service.ts`):**
  - **Price Lists:** Tier-specific price lists (e.g., Enterprise List at a 12% baseline discount, Premium at 6%).
  - **Resolution Hierarchy:** Resolves the narrowest valid price list item (matching customer tier, currency, date window, and variant). If absent, falls back to `Product.basePrice`.
  - **Price Source Tracking:** Quotes record whether a price was derived from a tiered price list (`PRICE_LIST`) or catalog base (`BASE_PRICE`), guaranteeing immutability against retroactive catalog changes.
  - **Tax & Unit Cost Tracking:** Line items calculate tax rates and maintain product cost prices (`costPrice`) to establish true gross margins.

### 4. Discount Governance & Blended Risk Engine

Traditional CPQ software fails by either ignoring spread-out micro-discounts or permitting dangerous margin leakage. DealFlow360 implements a state-of-the-art **Blended Risk Engine (`risk.service.ts`)**:

- **Line-Aware Discount Ceilings:** Rather than applying a blanket order-level limit, discount ceilings are defined per **Customer Tier × Product Category**. A rep might be permitted up to 20% on Cloud Services but capped at 6% on low-margin Hardware.
- **Margin-Derived Safeguards:** Seeded category ceilings are derived from the *worst-margin* product in each category, ensuring that even maximum allowable discounts retain at least an ~8% margin floor.
- **The Blended Risk Algorithm:**
  $$\text{Weighted Excess} = \frac{\sum (\text{Line Subtotal} \times \text{Discount Excess \%})}{\text{Total Net Order Value}}$$
  $$\text{Discount Risk} = \max(\text{Weighted Excess} \times 8, \; \text{Max Single Line Excess} \times 3)$$
  $$\text{Margin Risk} = \max(0, \; (25\% - \text{Order Margin \%}) \times 4)$$
  $$\text{Blended Risk Score} = \text{clamp}(0, \; 100, \; \max(\text{Discount Risk}, \; \text{Margin Risk}))$$
- **Dual Component Transparency:** Returns both discount risk and margin risk components, explicitly listing offending lines and the mathematical reason for approval triggers.

### 5. Dynamic Multi-Level Approval Engine

- **Calibrated Policy Bands:**
  - **Low Risk (0 – 24.99):** Auto-Approved instantly upon recalculation. No human approver required.
  - **Medium Risk (25 – 59.99):** Routed to the sales team's `SALES_MANAGER`.
  - **High Risk (60 – 100):** Multi-stage sequential approval: must be approved first by `SALES_MANAGER`, then escalated to `FINANCE`.
- **Automatic State Synchronization (`syncApprovalStatus`):**
  - Quotes re-entering recalculation automatically enter `PENDING_APPROVAL` if edited above the threshold.
  - If a rep lowers discounts back into policy, approval is automatically cleared—eliminating manual cancellation overhead.
- **Immutable Action Auditing:** Every decision (`APPROVE`, `REJECT`, `RETURN`) records the actor, timestamp, and mandatory business rationale in `ApprovalAction`.
- **Semantic Versioning & Revisions:** Any edits made to a quotation that has already been dispatched to a customer create a read-only historical `QuoteRevision` snapshot and increment the quotation's `versionNumber`.

### 6. Predictive Upsell, Cross-Sell & Promotion Recommendations

- **Directed Product Graph:** Uses `ProductRelationship` mappings (`UPSELL`, `CROSS_SELL`, `ACCESSORY`) paired with relevance affinity scores.
- **Margin Floor Gating:** Recommendations are filtered through `minimumMarginPercent` (default 15%). Any suggestion whose priced margin for the specific customer tier falls below the floor is suppressed.
- **Promotion Rank Boosting:** Live marketing campaigns (`Promotion`) automatically award an algorithmic rank boost (+0.15) to prioritized SKUs.
- **Real-Time Impact Simulation:** When recommending a product, the engine calculates the *exact post-addition order margin and risk score*. A rep can visibly see how bundling a high-margin service pulled a 28-risk deal down to 22, unlocking automatic approval.
- **Conversion Telemetry:** Tracks `SHOWN`, `ACCEPTED`, and `DISMISSED` events in `RecommendationEvent` for conversion rate analytics.

### 7. Customer Portal & Collaborative Negotiation Threads

- **Decoupled Customer Boundary:** The customer portal (`/portal`) operates on an isolated route tree and service layer (`portal.service.ts`).
- **Strict Data Redaction:** Internal cost prices, line margins, discount ceilings, risk scores, and approval instance histories are completely scrubbed from customer API responses.
- **Customer Storefront & RFQ:** Authorized buyers can browse their tier's catalog and submit Quote Requests directly into the rep's queue.
- **Interactive Negotiation Thread:**
  - **Line Comments:** Buyers post comments directly against individual lines (e.g., querying license terms or requesting bulk adjustments).
  - **Change Requests:** Structured requests to alter overall terms, delivery dates, or payment options.
  - **Counter-Offers:** Buyers propose alternative pricing (target discount % or total deal amount) with mandatory business rationale.
- **Seller Negotiation Panel (`NegotiationPanel.tsx`):** Sales reps review customer feedback, accept or reject counter-offers, apply negotiated figures, and trigger automated recalculations with one click.
- **Instant Acceptance:** Customers can electronically confirm approved quotations directly from the portal, locking the deal and spawning an order.

### 8. Order Lifecycle & Immutable State Transition

- **Quote-to-Order Handover:** Confirming a deal transitions the quotation to `CONFIRMED` and creates an immutable `Order` with synchronized `OrderLine` items.
- **Pricing Context Snapshotting:** Line items freeze unit prices, applied discounts, cost prices, and currency codes, guaranteeing that future catalog price updates never alter existing sales orders.
- **Managerial Cancellation:** Orders can be cancelled by authorized management/finance users, triggering inventory unreservation and cancellation of downstream fulfillment orders.

### 9. Warehouse Split Allocation & Fulfillment Optimization

- **Physical vs. Digital Distinction:** Fulfillment orders exclude non-tangible lines (cloud storage, software seats), allocating only physical `GOODS`.
- **Greedy Set-Cover Algorithm (`allocation.service.ts`):**
  - Evaluates live on-hand inventory across all regional distribution centers (`Warehouse`).
  - Solves the set-cover problem to satisfy demand using the minimum number of warehouses, breaking ties toward depots with lower `shippingCostWeight`.
  - Dramatically reduces multi-package handling overhead and freight expenses.
- **Split Allocations & Backorders:**
  - `SINGLE_WAREHOUSE`: Entire order fulfilled from one primary hub.
  - `SPLIT`: Quantities distributed across multiple depots when no single site holds sufficient stock.
  - `BACKORDER`: Unfulfillable demand is segregated into an open `Backorder` record, parked at the lowest-cost depot stocking the SKU.
- **Dynamic Restock Consolidation:** When incoming inventory replenishes a shorted SKU, the fulfillment engine detects the improved allocation and prompts warehouse operators to execute "Consolidate Remaining Backorder" before dispatching.
- **Dispatch & Tracking:** Supports picking, packing, actual shipping cost recording, and final dispatch confirmation.

### 10. Hybrid Billing & Recurring Subscription Management

Modern enterprise sales bundle hardware boxes with ongoing cloud or support commitments. DealFlow360 treats hybrid billing as a first-class citizen:

- **Order Splitting by `LineType`:** When an order is confirmed, lines marked `RECURRING` automatically initialize customer `Subscription` and `SubscriptionLine` records tied to designated `SubscriptionPlan` definitions.
- **Automated Billing Schedules:** Pre-computes calendar billing dates across Monthly, Quarterly, and Annual intervals.
- **Recurring Invoicing Engine (`/api/invoices/run-recurring`):** Batch processes due billing schedules, automatically emitting standard billing invoices for upcoming periods.
- **Proration Engine (`period.ts`):**
  - Calculates exact day-level unconsumed fractions (`unusedFraction = remainingDays / totalDays`) when subscriptions are modified mid-cycle.
  - Generates `ProrationEvent` audit entries and automatically calculates credit note adjustments or balance deductions upon seat changes or contract cancellations.

### 11. Invoicing, Multi-Method Payments & Credit Notes

- **Invoice State Machine:** Enforces formal billing states: `DRAFT` $\rightarrow$ `ISSUED` $\rightarrow$ `PARTIALLY_PAID` $\rightarrow$ `PAID` $\rightarrow$ `OVERDUE` $\rightarrow$ `VOID`.
- **Payment Processing:** Records payments against invoices supporting multiple payment methods (`CREDIT_CARD`, `BANK_TRANSFER`, `ACH`, `CHECK`) with unique transaction references.
- **Balance Tracking:** Maintains real-time tracking of `totalAmount`, `amountPaid`, and `amountDue`.
- **Credit Notes:** Issues credit notes for returns, billing errors, or proration refunds, deducting credit amounts directly from outstanding invoice totals.

### 12. Deal Health Telemetry & Proactive Anomaly Detection

Computed on read to avoid stale background caches, the Deal Health engine (`health.service.ts`) acts as an automated sales operations radar:

- **Composite Health Score (0–100):** Derives an overall health rating (`HEALTHY`, `AT_RISK`, `CRITICAL`) based on inactivity duration, discount variance, fulfillment backorder severity, and billing delays.
- **Automated Anomaly Alerts:**
  - **`STALLED`:** Triggered when a quote remains inactive past `STALLED_DEAL_DAYS` (default: 7 days).
  - **`DISCOUNT_ANOMALY`:** Raised when a rep's discount exceeds their historical average by `DISCOUNT_ANOMALY_MULTIPLIER` (default: 1.5×).
  - **`DELIVERY_SLIPPAGE`:** Generated when estimated shipping dates pass without dispatch, or when backorders exceed target restocking dates.
  - **`MARGIN_EROSION`:** Triggered when order-level margins fall beneath company thresholds.
- **Executive Triage Actions:** Sales managers can directly act on anomaly alerts:
  - **Nudge Rep:** Automatically dispatches an internal notification/prompt to the assigned AE.
  - **Escalate to Manager:** Re-routes the deal to executive leadership.
  - **Dismiss Alert:** Resolves the alert with a mandatory audit explanation.

### 13. Executive Analytics, Reporting & CSV Export

- **Executive KPI Dashboard:** Real-time metrics on Pipeline Value, Closed-Won Volume, Win Rate %, Average Deal Size, Average Discount %, and Pending Approvals.
- **Category & Margin Breakdown:** Revenue and gross margin contribution segmented across product categories.
- **Sales Rep Performance:** Leaderboard comparing quote volumes, win rates, and discount discipline across team members.
- **CSV Data Pipeline:** Dedicated streaming endpoint (`/api/reports/sales.csv`) for exporting sales and deal analytics to external data warehouses and BI platforms.

### 14. Immutable Audit Logging & Compliance

- **Enterprise Audit Trail:** Comprehensive recording across all critical system mutations in `AuditLog`.
- **Structured Change Data:** Records `actorUserId`, `action`, `entityType`, `entityId`, `oldValues` (JSON), `newValues` (JSON), `reason`, client IP address, user agent, and timestamp.
- **Tamper-Resistant:** Audit records are write-only and cannot be altered or removed through standard application workflows.

### 15. System Settings & Developer Affordances

- **Dynamic Business Thresholds:** System administrators configure operational constants in `SystemSetting` without requiring database migrations or server reboots:
  - `STALLED_DEAL_DAYS` (Default: 7)
  - `DISCOUNT_ANOMALY_MULTIPLIER` (Default: 1.5)
  - `APPROVAL_RISK_THRESHOLD` (Default: 25)
  - `QUOTE_VALIDITY_DAYS` (Default: 30)
- **Local Development Outbox:** Built-in mail capture utility (`/api/dev/outbox`) intercepting verification and password reset links when running in staging or development environments.

---

## Detailed Process Flows (Mermaid.js)

### Flow 1: End-to-End Deal Progression (Quote-to-Cash)

```mermaid
sequenceDiagram
    autonumber
    actor Rep as Sales Representative
    actor Approver as Sales Manager / Finance
    actor Customer as B2B Customer (Portal)
    participant Engine as DealFlow360 Core Engine
    participant Wh as Warehouse Fulfillment
    participant Billing as Subscription & Invoicing

    Rep->>Engine: Create Quotation for Customer
    Rep->>Engine: Add Products, Variants & Apply Discounts
    Engine->>Engine: Calculate Pricing, Margin & Blended Risk Score
    
    alt Blended Risk Score >= 25 (Approval Required)
        Engine-->>Rep: Status: PENDING_APPROVAL
        Approver->>Engine: Review Offending Lines & Risk Factors
        Approver->>Engine: Approve Quotation
    else Low Risk (Score < 25)
        Engine-->>Rep: Status: APPROVED (Auto-cleared)
    end

    Rep->>Engine: Send Quotation to Customer Portal
    Customer->>Engine: Access Portal, Review Terms & Line Items
    
    opt Collaborative Negotiation
        Customer->>Engine: Submit Line Comment / Change Request / Counter-Offer
        Engine-->>Rep: Alert: Customer Counter-Offer Received
        Rep->>Engine: Accept or Adjust Negotiated Terms
        Engine->>Engine: Recalculate Totals, Margin & Re-sync Approval
    end

    Customer->>Engine: Electrically Confirm Quotation
    Engine->>Engine: Convert Quotation to Confirmed Order
    
    par Physical Fulfillment
        Engine->>Wh: Run Greedy Set-Cover Allocation
        Wh->>Wh: Split Order Across Warehouses or Issue Backorder
        Wh-->>Customer: Ship Consignments & Dispatch Tracking
    and Hybrid Billing
        Engine->>Billing: Generate Subscriptions & Future Billing Schedules
        Billing->>Billing: Issue Initial Order & Recurring Invoices
        Customer->>Billing: Submit Payment (Card / Wire / ACH)
        Billing-->>Customer: Issue Payment Receipt & Credit Notes (if prorated)
    end
```

---

### Flow 2: Dynamic Pricing & Blended Risk Evaluation

```mermaid
flowchart TD
    StartLine["Input Quote Line Item<br/>(Customer, Product, Variant, Quantity, Discount %)"] --> PricingCheck{"Does Customer Tier have an<br/>Active Price List for SKU?"}
    
    PricingCheck -- "Yes" --> TierPrice["Unit Price = PriceListItem.unitPrice<br/>PriceSource = 'PRICE_LIST'"]
    PricingCheck -- "No" --> BasePrice["Unit Price = Product.basePrice + Variant Uplift<br/>PriceSource = 'BASE_PRICE'"]
    
    TierPrice & BasePrice --> LineSubtotal["Compute Line Net Subtotal:<br/>Qty × Unit Price × (1 - Discount %)"]
    LineSubtotal --> CostCheck["Lookup Product.costPrice & Variant Cost"]
    CostCheck --> LineMargin["Compute Line Margin % & Margin Amount"]

    LineMargin --> CeilingCheck{"Lookup Discount Rule:<br/>Tier × Category Ceiling"}
    CeilingCheck -- "Rule Exists" --> ApplyCatCeiling["Ceiling = DiscountRule.maxDiscountPercent"]
    CeilingCheck -- "No Category Rule" --> ApplyTierCeiling["Ceiling = CustomerTier.defaultDiscountCeiling"]
    
    ApplyCatCeiling & ApplyTierCeiling --> ExcessCalc["Calculate Discount Excess %:<br/>Max(0, Discount % - Ceiling %)"]
    
    subgraph "Order-Wide Blended Risk Calculation"
        ExcessCalc --> OrderAgg["Aggregate All Quote Lines"]
        OrderAgg --> WeightedExcess["Calculate Weighted Excess %:<br/>Sum(Excess % × Line Net Subtotal) / Total Net Total"]
        OrderAgg --> MaxExcess["Identify Max Single Line Excess %"]
        OrderAgg --> OrderMargin["Calculate Overall Order Margin %"]
        
        WeightedExcess & MaxExcess --> DiscRisk["Discount Risk = Max(Weighted Excess * 8, Max Single Excess * 3)"]
        OrderMargin --> MargRisk["Margin Risk = Max(0, (25% - Order Margin %) * 4)"]
        
        DiscRisk & MargRisk --> BlendedScore["Blended Risk Score = Clamp(0, 100, Max(Discount Risk, Margin Risk))"]
    end

    BlendedScore --> PolicyMatch{"Match Score to Approval Policy"}
    PolicyMatch -- "0 - 24.99" --> AutoApp["Approval Status = APPROVED (Auto)"]
    PolicyMatch -- "25.00 - 59.99" --> MgrReq["Approval Status = PENDING_APPROVAL<br/>Role: SALES_MANAGER"]
    PolicyMatch -- "60.00 - 100" --> FinReq["Approval Status = PENDING_APPROVAL<br/>Sequential: SALES_MANAGER → FINANCE"]
```

---

### Flow 3: Risk-Based Approval & Revision State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Rep Creates Quotation

    state DRAFT {
        [*] --> Editing
        Editing --> Recalculating: Add/Update Lines or Discount
        Recalculating --> LowRisk: Blended Risk < 25
        Recalculating --> NeedsApproval: Blended Risk >= 25
        LowRisk --> ReadyToSend: Ready
        NeedsApproval --> PendingInternal: Flagged
    }

    DRAFT --> PENDING_APPROVAL: Rep Requests Send (if risk >= 25)
    DRAFT --> SENT: Rep Sends Quote (if risk < 25)

    state PENDING_APPROVAL {
        [*] --> ManagerReview
        ManagerReview --> FinanceReview: Manager Approves (Score >= 60)
        ManagerReview --> ApprovedInternal: Manager Approves (Score < 60)
        ManagerReview --> Returned: Manager Returns for Revision
        ManagerReview --> Rejected: Manager Rejects
        FinanceReview --> ApprovedInternal: Finance Approves
        FinanceReview --> Returned: Finance Returns
        FinanceReview --> Rejected: Finance Rejects
    }

    Returned --> DRAFT: Rep Adjusts Terms
    Rejected --> REJECTED: Terminal State
    ApprovedInternal --> APPROVED: Cleared by Policy

    APPROVED --> SENT: Rep Dispatches Quote to Customer

    state SENT {
        [*] --> UnderReview
        UnderReview --> UNDER_NEGOTIATION: Customer Comments / Counter-Offers
        UnderReview --> CONFIRMED: Customer Accepts As-Is
        UnderReview --> EXPIRED: Validity Date Reached
    }

    state UNDER_NEGOTIATION {
        [*] --> ThreadOpen
        ThreadOpen --> CounterPending: Customer Submits Counter-Offer
        CounterPending --> RepModifying: Rep Accepts/Counters
        RepModifying --> RevisionCreated: Generate QuoteRevision Snapshot
        RevisionCreated --> Recalculating
    }

    CONFIRMED --> ORDER_CREATED: Spawns Confirmed Order
    ORDER_CREATED --> [*]
```

---

### Flow 4: Bidirectional Customer Negotiation Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Cust as Customer (Portal User)
    participant Portal as Customer Portal API
    participant DB as DealFlow360 Database
    participant Internal as Quotations Service
    actor Rep as Sales Representative

    Rep->>Internal: Send Quotation #Q-1042 ($48,500)
    Internal->>DB: Set Status = 'SENT', ApprovalStatus = 'APPROVED'
    DB-->>Portal: Expose Quote (Cost Prices & Risk Scores Redacted)
    
    Cust->>Portal: View Quotation in Portal Store
    Cust->>Portal: Post Line Comment ("Can you do 15% on the Server Rack?")
    Portal->>DB: Create LineComment Record
    DB-->>Rep: Negotiation Panel Notification

    Cust->>Portal: Submit Counter-Offer (Target Total: $45,000, Reason: "Budget cap")
    Portal->>DB: Create CounterOffer (Status = 'PENDING')
    Portal->>DB: Set Quote Status = 'UNDER_NEGOTIATION'
    DB-->>Rep: Highlight Counter-Offer in Negotiation Panel

    Rep->>Internal: Review Counter-Offer in Quotation Builder
    Rep->>Internal: Apply Negotiated Discount (Accept Counter-Offer)
    Internal->>DB: Snapshot Current State to QuoteRevision (v1)
    Internal->>DB: Update CounterOffer Status = 'ACCEPTED'
    Internal->>Internal: Recalculate Quotation (New Total: $45,000)
    Internal->>Internal: Verify Blended Risk & Re-sync Approval
    
    Internal->>DB: Set Status = 'SENT', Increment versionNumber = 2
    DB-->>Portal: Updated Quotation v2 Available to Customer
    
    Cust->>Portal: Review Final Revised Terms
    Cust->>Portal: Click "Confirm & Place Order"
    Portal->>DB: Set Quote Status = 'CONFIRMED'
    Portal->>Internal: Trigger Order Conversion
    Internal->>DB: Create Confirmed Order #ORD-8801
    Portal-->>Cust: Display Order Confirmation & Dispatch Tracking
```

---

### Flow 5: Greedy Set-Cover Warehouse Allocation & Restock Consolidation

```mermaid
flowchart TD
    Start["Order Confirmed with Physical Goods Demand"] --> DemandFilter["Filter Lines: lineType = 'GOODS'"]
    DemandFilter --> QueryStock["Query On-Hand & Reserved Stock Across All Warehouses"]
    
    subgraph "Greedy Set-Cover Allocation Algorithm"
        QueryStock --> LoopStart{"Is Demand Fully Allocated?"}
        LoopStart -- "No" --> EvalSites["Evaluate Each Warehouse:<br/>1. Number of unfulfilled lines covered<br/>2. Total unit capacity<br/>3. Tie-breaker: Lowest shippingCostWeight"]
        EvalSites --> PickBest["Select Winning Warehouse with Highest Coverage"]
        PickBest --> AllocateLines["Allocate Max Available Units from Selected Warehouse"]
        AllocateLines --> DecrementDemand["Decrement Remaining Demand"]
        DecrementDemand --> LoopStart
        LoopStart -- "Yes" --> BuildPlan["Compile Final Allocation Plan"]
    end

    BuildPlan --> ShortageCheck{"Any Remaining Unfulfilled Demand?"}
    ShortageCheck -- "No (100% Sourced)" --> PlanType{"Depots Used?"}
    PlanType -- "Single Depot" --> SinglePlan["Method: 'SINGLE_WAREHOUSE'<br/>1 Shipment, Minimal Shipping Cost"]
    PlanType -- "Multiple Depots" --> SplitPlan["Method: 'SPLIT'<br/>N Shipments, Weighted Handling Cost"]

    ShortageCheck -- "Yes (Stock Shortfall)" --> BackorderPlan["Method: 'BACKORDER'<br/>Allocate Available Stock +<br/>Create Backorder Record for Shortfall"]
    BackorderPlan --> ParkBackorder["Park Shortfall at Lowest-Cost Warehouse stocking the SKU"]

    SinglePlan & SplitPlan & BackorderPlan --> CommitAlloc["Persist FulfillmentOrder & FulfillmentAllocation Records"]
    CommitAlloc --> ReserveStock["Increment Inventory Reservations in Database"]

    subgraph "Restock & Consolidation Lifecycle"
        ParkBackorder -.-> StockArrival["New Inventory Shipment Received at Depot"]
        StockArrival --> TriggerEval["Fulfillment Engine Re-evaluates Backorders"]
        TriggerEval --> PromptConsolidate["Prompt: 'Consolidate Remaining Backorder'"]
        PromptConsolidate --> MergeAlloc["Merge Backorder into Active Fulfillment Order"]
        MergeAlloc --> Dispatch["Pick, Pack, Enter Tracking & Ship Order"]
    end

    SinglePlan & SplitPlan --> Dispatch
```

---

### Flow 6: Hybrid Billing, Recurring Schedules & Mid-Cycle Proration

```mermaid
flowchart TD
    OrderConfirmed["Hybrid Order Confirmed<br/>(e.g., Server Hardware + Annual 24/7 Support)"] --> LineSeparator{"Classify Order Lines"}
    
    LineSeparator -- "Physical Line (GOODS)" --> OneTimeInvoice["Generate Immediate One-Time Invoice Line"]
    LineSeparator -- "Recurring Line (SERVICE)" --> CreateSub["Create Subscription & SubscriptionLine Records"]

    subgraph "Subscription Lifecycle"
        CreateSub --> PlanLookup["Attach SubscriptionPlan<br/>(Interval: Month / Quarter / Year, Proration: Enabled)"]
        PlanLookup --> ScheduleGen["Generate Scheduled Billing Events<br/>(BillingSchedule rows for contract duration)"]
        ScheduleGen --> ActiveSub["Subscription Status = 'ACTIVE'"]
    end

    subgraph "Recurring Billing Run"
        Cron["Automated Recurring Billing Runner<br/>(POST /api/invoices/run-recurring)"] --> DueSchedules["Query BillingSchedule where<br/>billingDate <= Today and Status = 'PENDING'"]
        DueSchedules --> BatchInvoice["Generate Recurring Invoices for Due Periods"]
        BatchInvoice --> MarkInvoiced["Update BillingSchedule Status = 'INVOICED'"]
    end

    subgraph "Mid-Cycle Proration Event"
        CustomerReq["Customer Requests Seat Reduction / Cancellation Mid-Period"] --> TimeCalc["Calculate Remaining Cycle Time:<br/>Remaining Days / Total Period Days = Unused Fraction"]
        TimeCalc --> CalcCredit["Compute Prorated Credit Amount:<br/>Unused Fraction × Line Periodic Amount"]
        CalcCredit --> RecordProration["Create ProrationEvent Record"]
        RecordProration --> IssueCredit["Issue CreditNote against Customer Account"]
        IssueCredit --> UpdateSchedule["Update or Cancel Future Billing Schedules"]
    end

    OneTimeInvoice & BatchInvoice --> FinalInvoice["Deliver Invoice to Customer"]
    IssueCredit -.-> FinalInvoice
```

---

### Flow 7: Deal Health Telemetry & Anomaly Detection Pipeline

```mermaid
flowchart TD
    Request["Manager / Exec Loads Deal Health Dashboard<br/>(GET /api/deal-health/dashboard)"] --> LoadSettings["Fetch System Settings:<br/>STALLED_DEAL_DAYS, DISCOUNT_ANOMALY_MULTIPLIER, etc."]
    
    subgraph "On-Read Telemetry & Radar Engine"
        LoadSettings --> QueryActive["Query Open Quotations & Orders in Scope"]
        
        QueryActive --> StalledCheck["Check Inactivity:<br/>Days since last activity > STALLED_DEAL_DAYS?"]
        StalledCheck -- "Yes" --> GenStalled["Raise AnomalyAlert: 'STALLED'<br/>Severity: MEDIUM / HIGH"]

        QueryActive --> DiscCheck["Check Discount Anomaly:<br/>Rep Quote Discount > (Rep Avg Discount × Multiplier)?"]
        DiscCheck -- "Yes" --> GenDisc["Raise AnomalyAlert: 'DISCOUNT_ANOMALY'<br/>Severity: HIGH"]

        QueryActive --> DeliveryCheck["Check Fulfillment Health:<br/>Expected Ship Date Overdue or Backorder Overdue?"]
        DeliveryCheck -- "Yes" --> GenSlip["Raise AnomalyAlert: 'DELIVERY_SLIPPAGE'<br/>Severity: CRITICAL"]

        QueryActive --> MarginCheck["Check Margin Erosion:<br/>Quote Margin < Target Floor Margin?"]
        MarginCheck -- "Yes" --> GenMargin["Raise AnomalyAlert: 'MARGIN_EROSION'<br/>Severity: HIGH"]
    end

    GenStalled & GenDisc & GenSlip & GenMargin --> PersistAlerts["Persist New AnomalyAlerts to Database"]
    PersistAlerts --> ComputeScores["Compute Quotation DealHealth Scores (0-100)<br/>Categorize: HEALTHY | AT_RISK | CRITICAL"]
    ComputeScores --> RenderDashboard["Display Filterable Radar Dashboard in UI"]

    subgraph "Managerial Actions"
        RenderDashboard --> ActionChoice{"Manager Selects Action on Alert"}
        ActionChoice -- "Nudge Rep" --> NudgeAE["Send Automated Nudge to Assigned Sales Rep"]
        ActionChoice -- "Escalate" --> EscalateExec["Escalate Alert to VP / Executive Queue"]
        ActionChoice -- "Dismiss" --> DismissAlert["Resolve Alert with Audit Rationale"]
    end
```

---

## Database Schema & Domain Models

DealFlow360 is powered by **53 relational Prisma models** mapped onto a PostgreSQL schema, strictly separated into logical functional domains:

```mermaid
erDiagram
    User ||--o{ UserRole : has
    Role ||--o{ UserRole : defines
    User ||--o{ TeamMember : joins
    Team ||--o{ TeamMember : contains
    User ||--o{ Quotation : creates
    User ||--o{ Order : manages
    User ||--o{ AuditLog : records

    Customer ||--o{ CustomerUser : links
    CustomerTier ||--o{ Customer : categorizes
    Customer ||--o{ Quotation : requests
    Customer ||--o{ Order : places
    Customer ||--o{ Subscription : holds
    Customer ||--o{ Invoice : billed

    Category ||--o{ Product : classifies
    Product ||--o{ ProductVariant : specializes
    Product ||--o{ PriceListItem : prices
    PriceList ||--o{ PriceListItem : contains
    CustomerTier ||--o{ PriceList : applies
    CustomerTier ||--o{ DiscountRule : governs

    Quotation ||--o{ QuoteLine : contains
    Quotation ||--o{ QuoteRevision : versions
    Quotation ||--o{ ApprovalInstance : requires
    ApprovalInstance ||--o{ ApprovalAction : records
    ApprovalPolicy ||--o{ ApprovalStep : defines

    Quotation ||--o{ ChangeRequest : negotiates
    Quotation ||--o{ LineComment : discusses
    Quotation ||--o{ CounterOffer : bargains
    Quotation ||--|| DealHealth : tracks
    Quotation ||--o{ AnomalyAlert : triggers
    Quotation ||--o{ Order : converts

    Order ||--o{ OrderLine : contains
    Order ||--o{ FulfillmentOrder : fulfills
    FulfillmentOrder ||--o{ FulfillmentAllocation : routes
    Warehouse ||--o{ FulfillmentAllocation : sources
    Warehouse ||--o{ Inventory : stores
    OrderLine ||--o{ Backorder : shorts

    Order ||--o{ Subscription : spawns
    Subscription ||--o{ SubscriptionLine : contains
    SubscriptionPlan ||--o{ SubscriptionLine : defines
    SubscriptionLine ||--o{ BillingSchedule : schedules
    SubscriptionLine ||--o{ ProrationEvent : adjusts

    Order ||--o{ Invoice : bills
    Invoice ||--o{ InvoiceLine : items
    Invoice ||--o{ Payment : receives
    Invoice ||--o{ CreditNote : credits
```

### Model Classification Matrix (53 Models)

| # | Group | Models | Core Responsibility |
|---|---|---|---|
| **1–5** | **Identity & Teams** | `User`, `Role`, `UserRole`, `Team`, `TeamMember` | Multi-role user authentication, sales team hierarchies, manager mapping, and scoping. |
| **6–9** | **Customers & Portal** | `Customer`, `CustomerTier`, `CustomerUser`, `PortalInvite`, `VerificationToken` | B2B accounts, pricing tiers, portal invitations, email verification, and contact mappings. |
| **10–16** | **Catalog & Pricing** | `Category`, `Product`, `ProductVariant`, `Attribute`, `AttributeValue`, `VariantAttributeValue`, `PriceList`, `PriceListItem` | Master product catalog, configurable multi-attribute variants, and tiered price lists. |
| **17–19** | **Discount Governance** | `DiscountRule`, `ApprovalPolicy`, `ApprovalStep` | Category/tier discount ceilings, risk score ranges, and sequential approver role steps. |
| **20–24** | **Quotations & Execution** | `Quotation`, `QuoteLine`, `QuoteRevision`, `ApprovalInstance`, `ApprovalAction` | Deals, calculated line items, immutable revision snapshots, and logged approval workflows. |
| **25–27** | **Customer Negotiation** | `ChangeRequest`, `LineComment`, `CounterOffer` | Bidirectional negotiation threads, line comments, scope alterations, and price counter-offers. |
| **28–31** | **Recommendations & Promos** | `ProductRelationship`, `Promotion`, `PromotionProduct`, `RecommendationEvent` | Directed upsell/cross-sell relationships, active marketing campaigns, and conversion analytics. |
| **32–33** | **Order Execution** | `Order`, `OrderLine` | Confirmed sales orders, frozen pricing context, and physical vs. recurring line tagging. |
| **34–39** | **Warehouse & Fulfillment** | `Warehouse`, `Inventory`, `ReplenishmentRule`, `FulfillmentOrder`, `FulfillmentAllocation`, `Backorder` | Multi-depot stock, greedy set-cover allocations, split shipments, and backorder tracking. |
| **40–45** | **Subscriptions & Schedules**| `SubscriptionPlan`, `ProductSubscriptionPlan`, `Subscription`, `SubscriptionLine`, `BillingSchedule`, `ProrationEvent` | Recurring contract plans, calendar billing schedules, and mid-cycle proration mathematics. |
| **46–49** | **Invoices & Payments** | `Invoice`, `InvoiceLine`, `Payment`, `CreditNote` | Full invoice lifecycle, multi-method payment capture, and credit note balance deductions. |
| **50–52** | **Analytics & Audit** | `DealHealth`, `AnomalyAlert`, `AuditLog` | Computed deal health scores, radar anomaly alerts, and immutable enterprise audit logs. |
| **53** | **System Configuration** | `SystemSetting` | Tunable runtime operational parameters (stalled days, discount multipliers, validity). |

---

## API Reference Matrix

All endpoints require standard `Bearer <JWT>` authentication unless designated public.

### Authentication & Portal Onboarding (`/api/auth`)
- `POST /api/auth/signup` — Register new sales rep or customer.
- `POST /api/auth/login` — Authenticate and receive signed JWT.
- `GET /api/auth/me` — Retrieve active authenticated user profile and roles.
- `POST /api/auth/verify-email` — Verify email via emailed code.
- `POST /api/auth/forgot-password` — Initiate password recovery.
- `POST /api/auth/reset-password` — Complete password reset with token.
- `POST /api/auth/invites` — (*Rep+*) Send customer portal invitation.
- `POST /api/auth/accept-invite` — Claim account via invitation token.

### Dashboard & Analytics (`/api/dashboard` & `/api/reports`)
- `GET /api/dashboard/summary` — Role-scoped executive counters and alerts.
- `GET /api/reports/sales` — Aggregate pipeline volume, win rate, and rep metrics.
- `GET /api/reports/sales.csv` — Stream raw sales performance data as CSV.

### Customers & Tiers (`/api/customers`)
- `GET /api/customers` — List filtered customers with pagination.
- `POST /api/customers` — (*Rep+*) Create new B2B customer account.
- `GET /api/customers/:id` — Retrieve full customer account details and deal history.
- `PATCH /api/customers/:id` — Update customer metadata.
- `GET /api/customers/tiers` — List available customer tiers.

### Master Catalog & Pricing Engine (`/api/catalog`)
- `GET /api/catalog/products` — Filter products by category, type, and status.
- `GET /api/catalog/products/:id` — Product master detail including variants and attributes.
- `GET /api/catalog/categories` — Product category hierarchy.
- `POST /api/catalog/pricing/resolve` — Deterministic pricing and ceiling resolution for lines.

### Quotations & Revisions (`/api/quotations`)
- `GET /api/quotations` — Filter quotations by customer, status, risk, and team.
- `POST /api/quotations` — (*Rep+*) Create draft quotation.
- `GET /api/quotations/:id` — Full quotation details with lines, margin, and risk breakdown.
- `PATCH /api/quotations/:id` — Update quotation header metadata.
- `POST /api/quotations/:id/lines` — Add line item (triggers full recalculation & risk score).
- `PATCH /api/quotations/:id/lines/:lineId` — Modify line quantity, discount %, or description.
- `DELETE /api/quotations/:id/lines/:lineId` — Remove line item and recalculate deal.
- `POST /api/quotations/:id/discount` — Apply overall order discount.
- `POST /api/quotations/:id/send` — Send quotation to customer portal (checks approval status).
- `GET /api/quotations/:id/revisions` — Audit history of all previous quote versions.
- `POST /api/quotations/:id/confirm` — Handover quote into confirmed order.

### Upsell & Cross-Sell Recommendations (`/api/quotations/:id/recommendations`)
- `GET /api/quotations/:id/recommendations` — Fetch predictive recommendations with simulated margin/risk delta.
- `POST /api/quotations/:id/recommendations/:productId/accept` — Accept suggestion into quote.
- `POST /api/quotations/:id/recommendations/:productId/dismiss` — Permanently dismiss recommendation.

### Collaborative Negotiation (`/api/quotations/:id/negotiation`)
- `GET /api/quotations/:id/negotiation` — Retrieve full conversation and negotiation thread.
- `POST /api/quotations/:id/negotiation/reply` — (*Rep+*) Post reply to customer thread.
- `POST /api/quotations/:id/negotiation/change-requests/:id` — Accept/decline change request.
- `POST /api/quotations/:id/negotiation/counter-offers/:id` — Accept/decline counter-offer.

### Approval Management (`/api/approvals`)
- `GET /api/approvals` — (*Manager/Finance*) Queue of quotations pending user's sign-off.
- `GET /api/approvals/:id` — Detail of approval instance, policy steps, and risk factors.
- `POST /api/approvals/:id/act` — Submit approval decision (`APPROVE`, `REJECT`, `RETURN`).

### Orders & Logistics (`/api/orders`)
- `GET /api/orders` — List confirmed orders.
- `GET /api/orders/:id` — Complete order detail with physical and recurring breakdown.
- `POST /api/orders/:id/cancel` — (*Manager/Finance*) Cancel order and release reservations.

### Warehouse Split & Fulfillment (`/api/orders/:id/fulfillment`)
- `GET /api/orders/:id/fulfillment` — Current allocation plan and real-time suggested plan.
- `POST /api/orders/:id/fulfillment/accept` — (*Ops/Finance*) Accept suggested split plan.
- `POST /api/orders/:id/fulfillment/override` — (*Ops/Finance*) Apply manual warehouse allocations.
- `POST /api/orders/:id/fulfillment/consolidate` — (*Ops/Finance*) Consolidate backorders after restock.
- `POST /api/orders/:id/fulfillment/ship` — Confirm consignment dispatch with tracking number.

### Hybrid Subscriptions & Billing (`/api/subscriptions` & `/api/invoices`)
- `GET /api/subscriptions` — List active recurring customer subscriptions.
- `GET /api/subscriptions/:id` — Subscription detail with billing schedules and proration log.
- `PATCH /api/subscriptions/:id/lines/:lineId` — (*Finance*) Modify recurring seats (triggers proration).
- `POST /api/subscriptions/:id/cancel` — (*Finance*) Cancel subscription and generate final credit.
- `GET /api/invoices` — List invoices across all statuses.
- `GET /api/invoices/:id` — Invoice detail with payments and credit adjustments.
- `POST /api/invoices/run-recurring` — (*Finance*) Batch process all due subscription schedules.
- `POST /api/invoices/:id/payments` — (*Finance*) Record transaction payment against invoice.

### Deal Health Telemetry (`/api/deal-health`)
- `GET /api/deal-health/dashboard` — Live deal health status, radar metrics, and anomaly alerts.
- `POST /api/deal-health/alerts/:id/act` — Triage alert (`NUDGE_REP`, `ESCALATE`, `DISMISS`).

### Administration & Control Plane (`/api/admin`)
- `POST /api/admin/products` — (*Admin*) Add new catalog master SKU.
- `GET /api/admin/warehouses` & `POST /api/admin/warehouses` — Manage regional distribution centers.
- `GET /api/admin/warehouses/:id/stock` & `PUT /api/admin/warehouses/:id/stock` — Inventory adjustments.
- `GET /api/admin/subscription-plans` & `POST /api/admin/subscription-plans` — Manage recurring plans.
- `GET /api/admin/discounts` — View comprehensive discount governance matrix.
- `PUT /api/admin/discount-rules` — Upsert category/tier discount limits.
- `GET /api/admin/settings` & `PATCH /api/admin/settings` — Configure runtime operational thresholds.

### Dedicated Customer Portal Surface (`/api/portal`)
- `GET /api/portal/accounts` — Accounts linked to the logged-in customer user.
- `GET /api/portal/products` — Customer-tier storefront catalog.
- `POST /api/portal/requests` — Submit RFQ from storefront.
- `GET /api/portal/quotations` & `GET /api/portal/quotations/:id` — View received quotations.
- `POST /api/portal/quotations/:id/comments` — Post line-item comment.
- `POST /api/portal/quotations/:id/change-requests` — Request terms/scope changes.
- `POST /api/portal/quotations/:id/counter-offers` — Submit structured price counter-offer.
- `POST /api/portal/quotations/:id/confirm` — Electrically accept quotation and place order.
- `GET /api/portal/orders` & `GET /api/portal/orders/:id` — View placed orders and shipment tracking.

---

## Directory Structure

```text
DealFlow360/
├── docker-compose.yml              # PostgreSQL 17 database container
├── README.md                       # Comprehensive platform documentation
│
├── server/                         # Backend Express 5 + TypeScript application
│   ├── Dockerfile                  # Production container definition
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma           # 53 relational Prisma models
│   │   └── seed.ts                 # Full deterministic demo dataset seeder
│   └── src/
│       ├── index.ts                # App entrypoint, middleware & route mounting
│       ├── common/
│       │   ├── constants/          # Status constants (quotes, approvals, orders, etc.)
│       │   ├── errors/             # AppError, AuthError, ValidationError classes
│       │   ├── middleware/         # requireAuth, requireRole, error & 404 handlers
│       │   ├── types/              # Auth types, JWT payloads, Express augmentations
│       │   └── utils/              # Env, Prisma client, BCrypt, serialization, audit logger
│       └── modules/
│           ├── admin/              # Warehouse, stock, discount rules & system settings
│           ├── approvals/          # Risk-based approval queue & step progression
│           ├── auth/               # Sign-in, sign-up, email verification & invites
│           ├── billing/            # Subscriptions, proration, schedules & invoices
│           ├── catalog/            # Products, categories, variants & pricing engine
│           ├── customers/          # Customer accounts, tiers & portal user mapping
│           ├── dashboard/          # Role-scoped operational KPI counters
│           ├── dev/                # Development mail outbox viewer
│           ├── fulfillment/        # Greedy set-cover warehouse split & backorders
│           ├── health/             # Deal health scoring & proactive anomaly radar
│           ├── orders/             # Order lifecycle, line snapshotting & cancellation
│           ├── portal/             # Isolated customer self-service & negotiation API
│           ├── quotations/         # Quote builder, recalculation, revisions & risk engine
│           ├── recommendations/    # Graph-based predictive upsell & cross-sell
│           └── reports/            # Pipeline analytics & CSV export engine
│
└── client/                         # Frontend React 19 + Vite + TailwindCSS application
    ├── index.html
    ├── package.json
    ├── vite.config.ts              # Vite config with API proxy to localhost:3000
    └── src/
        ├── App.tsx                 # Client routing, role guards & layouts
        ├── main.tsx
        ├── index.css               # Design system & TailwindCSS styling tokens
        ├── context/
        │   └── AuthContext.tsx     # Global JWT session state & role evaluation
        ├── components/
        │   └── layout/             # AppShell, PortalLayout, ProtectedRoute guards
        └── pages/
            ├── LandingPage.tsx     # Product showcase & portal entry
            ├── auth/               # Login, Signup, Invite acceptance, Password reset
            ├── portal/             # Customer Portal: Storefront, Quotes, Orders, Track
            └── app/                # Internal Sales Operations Workspace:
                ├── Dashboard.tsx   # Sales overview, approvals & telemetry radar
                ├── admin/          # Backend configuration & system settings
                ├── approvals/      # Approver queue & risk factor inspector
                ├── billing/        # Invoices list, details, payment capture & proration
                ├── catalog/        # Product master catalog, variants & price check
                ├── customers/      # Customer directory, tier management & invite panel
                ├── health/         # Deal Health radar & anomaly alert triage
                ├── orders/         # Orders, fulfillment splitting & subscription panel
                ├── quotations/     # Quotation builder, risk panel & negotiation thread
                └── reports/        # Executive analytics, win rates & CSV download
```

---

## Getting Started & Local Setup

### Prerequisites

- **Node.js:** v20.x or higher
- **Docker & Docker Compose:** For running the local PostgreSQL 17 database
- **npm:** v10.x or higher

---

### Step 1: Start PostgreSQL Database

Launch the PostgreSQL 17 container defined in `docker-compose.yml`:

```bash
# From the project root directory
docker-compose up -d
```

Verify that PostgreSQL is running on `localhost:5432`:
```bash
docker ps
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