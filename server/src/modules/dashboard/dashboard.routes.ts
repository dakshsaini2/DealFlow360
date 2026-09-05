import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import * as dashboardController from "./dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", dashboardController.summary);
