import { Router } from "express";
import { requireRole } from "../../common/middleware/auth.middleware.js";
import * as controller from "./recommendations.controller.js";

/** Mounted under `/quotations/:id/recommendations`, so `:id` comes from there. */
export const recommendationsRouter = Router({ mergeParams: true });

recommendationsRouter.get("/", controller.list);

const canWrite = requireRole("ADMIN", "SALES_MANAGER", "SALES_REP");

recommendationsRouter.post("/:productId/accept", canWrite, controller.accept);
recommendationsRouter.post("/:productId/dismiss", canWrite, controller.dismiss);
