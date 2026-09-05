import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./health.service.js";
import { actOnAlertSchema, healthQuerySchema, idParamSchema } from "./health.types.js";

export async function dashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(healthQuerySchema, req.query);

    res.json(await service.getDashboard(currentUser(req), query));
  } catch (err) {
    next(err);
  }
}

export async function actOnAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(actOnAlertSchema, req.body);

    res.json(await service.actOnAlert(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}
