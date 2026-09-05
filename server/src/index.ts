import express from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./common/middleware/error.middleware.js";
import { env } from "./common/utils/env.js";
import { disconnectPrisma } from "./common/utils/prisma.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { approvalsRouter } from "./modules/approvals/approvals.routes.js";
import {
  invoicesRouter,
  subscriptionsRouter,
} from "./modules/billing/billing.routes.js";
import { warehousesRouter } from "./modules/fulfillment/fulfillment.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { portalRouter } from "./modules/portal/portal.routes.js";
import { quotationsRouter } from "./modules/quotations/quotations.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/customers", customersRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/quotations", quotationsRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/deal-health", healthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reports", reportsRouter);

/** The customer-facing surface — a separate, restricted view (spec B8). */
app.use("/api/portal", portalRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  });
}
