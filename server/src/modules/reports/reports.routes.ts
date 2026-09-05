import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import * as controller from "./reports.controller.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

/** A rep may run these, but only ever over their own book (enforced in the service). */
reportsRouter.get("/sales", controller.sales);
reportsRouter.get("/sales.csv", controller.salesCsv);
