import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./admin.service.js";
import {
  createPlanSchema,
  createTierSchema,
  createWarehouseSchema,
  idParamSchema,
  planProductsSchema,
  setStockSchema,
  updatePlanSchema,
  updateSettingsSchema,
  updateTierSchema,
  updateWarehouseSchema,
  upsertDiscountRuleSchema,
} from "./admin.types.js";

/** Wraps a handler so every controller below is three lines, not ten. */
function handler<T>(run: (req: Request) => Promise<T>, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(await run(req));
    } catch (err) {
      next(err);
    }
  };
}

/* ── warehouses & stock ───────────────────────────── */

export const listWarehouses = handler(() => service.listWarehouses());

export const createWarehouse = handler(
  (req) => service.createWarehouse(currentUser(req), validate(createWarehouseSchema, req.body)),
  201,
);

export const updateWarehouse = handler((req) =>
  service.updateWarehouse(
    currentUser(req),
    validate(idParamSchema, req.params).id,
    validate(updateWarehouseSchema, req.body),
  ),
);

export const setStock = handler((req) =>
  service.setStock(
    currentUser(req),
    validate(idParamSchema, req.params).id,
    validate(setStockSchema, req.body),
  ),
);

/* ── subscription plans ───────────────────────────── */

export const listPlans = handler(() => service.listPlans());

export const createPlan = handler(
  (req) => service.createPlan(currentUser(req), validate(createPlanSchema, req.body)),
  201,
);

export const updatePlan = handler((req) =>
  service.updatePlan(
    currentUser(req),
    validate(idParamSchema, req.params).id,
    validate(updatePlanSchema, req.body),
  ),
);

export const setPlanProducts = handler((req) =>
  service.setPlanProducts(
    currentUser(req),
    validate(idParamSchema, req.params).id,
    validate(planProductsSchema, req.body),
  ),
);

/* ── discount governance ──────────────────────────── */

export const getDiscountGovernance = handler(() => service.getDiscountGovernance());

export const createTier = handler(
  (req) => service.createTier(currentUser(req), validate(createTierSchema, req.body)),
  201,
);

export const updateTier = handler((req) =>
  service.updateTier(
    currentUser(req),
    validate(idParamSchema, req.params).id,
    validate(updateTierSchema, req.body),
  ),
);

export const upsertDiscountRule = handler((req) =>
  service.upsertDiscountRule(currentUser(req), validate(upsertDiscountRuleSchema, req.body)),
);

export const deleteDiscountRule = handler((req) =>
  service.deleteDiscountRule(currentUser(req), validate(idParamSchema, req.params).id),
);

/* ── thresholds ───────────────────────────────────── */

export const listSettings = handler(() => service.listSettings());

export const updateSettings = handler((req) =>
  service.updateSettings(currentUser(req), validate(updateSettingsSchema, req.body)),
);
