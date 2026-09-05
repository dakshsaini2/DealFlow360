import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./recommendations.service.js";
import {
  acceptSchema,
  productActionParamsSchema,
  quotationParamSchema,
} from "./recommendations.types.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(quotationParamSchema, req.params);

    res.json(await service.getSuggestions(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, productId } = validate(productActionParamsSchema, req.params);
    const input = validate(acceptSchema, req.body ?? {});

    res.json(
      await service.acceptSuggestion(currentUser(req), id, productId, input),
    );
  } catch (err) {
    next(err);
  }
}

export async function dismiss(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, productId } = validate(productActionParamsSchema, req.params);

    res.json(await service.dismissSuggestion(currentUser(req), id, productId));
  } catch (err) {
    next(err);
  }
}
