import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import { confirmQuotation } from "../orders/orders.service.js";
import * as service from "./portal.service.js";
import {
  changeRequestSchema,
  counterOfferSchema,
  idParamSchema,
  lineCommentSchema,
  listPortalQuotationsSchema,
  portalConfirmSchema,
} from "./portal.types.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listPortalQuotationsSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await service.listQuotations(currentUser(req), query, page));
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await service.getQuotation(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function comment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(lineCommentSchema, req.body);

    res.status(201).json(await service.addComment(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function requestChange(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(changeRequestSchema, req.body);

    res.status(201).json(await service.requestChange(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function counterOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(counterOfferSchema, req.body);

    res.status(201).json(await service.counterOffer(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

/**
 * The customer's one-click acceptance. It runs the same confirmation the rep
 * would, so approval still has to have cleared — the portal cannot be used to
 * push an unapproved discount into an order.
 */
export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(portalConfirmSchema, req.body ?? {});

    res
      .status(201)
      .json(await confirmQuotation(currentUser(req), id, input, "portal"));
  } catch (err) {
    next(err);
  }
}
