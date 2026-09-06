import { Router } from "express";
import {
  requireAuth,
  requireRole,
} from "../../common/middleware/auth.middleware.js";
import * as controller from "./admin.controller.js";

/**
 * Backend configuration. The spec puts product/warehouse/plan setup with the
 * Admin and discount tiers with the Sales Manager, so both roles get in here —
 * a rep does not, because these values are exactly what constrain a rep.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole("ADMIN", "SALES_MANAGER"));

/**
 * Admin only, unlike the rest of this router: a sales manager tunes the terms a
 * product is sold on, but does not decide what the catalogue contains.
 */
adminRouter.post("/products", requireRole("ADMIN"), controller.createProduct);

adminRouter.get("/warehouses", controller.listWarehouses);
adminRouter.post("/warehouses", controller.createWarehouse);
adminRouter.patch("/warehouses/:id", controller.updateWarehouse);
adminRouter.get("/warehouses/:id/stock", controller.listStock);
adminRouter.put("/warehouses/:id/stock", controller.setStock);

adminRouter.get("/subscription-plans", controller.listPlans);
adminRouter.post("/subscription-plans", controller.createPlan);
adminRouter.patch("/subscription-plans/:id", controller.updatePlan);
adminRouter.put("/subscription-plans/:id/products", controller.setPlanProducts);

adminRouter.get("/discounts", controller.getDiscountGovernance);
adminRouter.post("/tiers", controller.createTier);
adminRouter.patch("/tiers/:id", controller.updateTier);
adminRouter.put("/discount-rules", controller.upsertDiscountRule);
adminRouter.delete("/discount-rules/:id", controller.deleteDiscountRule);

adminRouter.get("/settings", controller.listSettings);
adminRouter.patch("/settings", controller.updateSettings);
