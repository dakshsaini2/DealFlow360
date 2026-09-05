import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./fulfillment.service.js";
import * as warehouses from "./warehouses.service.js";
import {
  idParamSchema,
  listWarehousesSchema,
  overrideSchema,
  shipSchema,
} from "./fulfillment.types.js";

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await service.getFulfillment(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.status(201).json(await service.acceptSuggestion(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function override(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(overrideSchema, req.body);

    res.status(201).json(await service.overrideAllocation(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function consolidate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await service.consolidateBackorders(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function ship(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(shipSchema, req.body ?? {});

    res.json(await service.ship(currentUser(req), id, input));
  } catch (err) {
    next(err);
  }
}

export async function listWarehouses(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listWarehousesSchema, req.query);

    res.json(await warehouses.listWarehouses(query));
  } catch (err) {
    next(err);
  }
}
