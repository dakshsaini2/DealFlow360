import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import * as dashboardService from "./dashboard.service.js";

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const user = currentUser(req);

    const [summary, recentQuotations] = await Promise.all([
      dashboardService.getSummary(user),
      dashboardService.getRecentQuotations(user),
    ]);

    res.json({ ...summary, recentQuotations });
  } catch (err) {
    next(err);
  }
}
