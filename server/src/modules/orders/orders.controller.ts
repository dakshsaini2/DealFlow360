import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./orders.service.js";
import {
  cancelOrderSchema,
  confirmQuotationSchema,
  idParamSchema,
  listOrdersSchema,
} from "./orders.types.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listOrdersSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await service.listOrders(currentUser(req), query, page));
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await service.getOrder(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

/** Mounted under `/api/quotations/:id/confirm` — `id` is the quotation. */
export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(confirmQuotationSchema, req.body ?? {});

    res
      .status(201)
      .json(await service.confirmQuotation(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(cancelOrderSchema, req.body);

    res.json(await service.cancelOrder(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}
