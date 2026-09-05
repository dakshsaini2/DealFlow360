import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./quotations.service.js";
import {
  addLineSchema,
  applyOrderDiscountSchema,
  createQuotationSchema,
  idParamSchema,
  lineParamsSchema,
  listQuotationsSchema,
  sendQuotationSchema,
  updateLineSchema,
  updateQuotationSchema,
} from "./quotations.types.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listQuotationsSchema, req.query);
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

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validate(createQuotationSchema, req.body);

    res.status(201).json(await service.createQuotation(currentUser(req), input));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(updateQuotationSchema, req.body);

    res.json(await service.updateQuotation(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function addLine(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(addLineSchema, req.body);

    res.status(201).json(await service.addLine(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function updateLine(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, lineId } = validate(lineParamsSchema, req.params);
    const input = validate(updateLineSchema, req.body);

    res.json(await service.updateLine(currentUser(req), id, lineId, input));
  } catch (err) {
    next(err);
  }
}

export async function removeLine(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, lineId } = validate(lineParamsSchema, req.params);

    res.json(await service.removeLine(currentUser(req), id, lineId));
  } catch (err) {
    next(err);
  }
}

export async function applyOrderDiscount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const { discountPercent } = validate(applyOrderDiscountSchema, req.body);

    res.json(
      await service.applyOrderDiscount(currentUser(req), id, discountPercent),
    );
  } catch (err) {
    next(err);
  }
}

export async function send(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const { reason } = validate(sendQuotationSchema, req.body ?? {});

    res.json(await service.sendQuotation(currentUser(req), id, reason));
  } catch (err) {
    next(err);
  }
}

export async function revisions(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json({ data: await service.listRevisions(currentUser(req), id) });
  } catch (err) {
    next(err);
  }
}
