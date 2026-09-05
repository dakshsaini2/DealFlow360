import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import * as customersService from "./customers.service.js";
import {
  createCustomerSchema,
  idParamSchema,
  listCustomersSchema,
  updateCustomerSchema,
} from "./customers.types.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listCustomersSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await customersService.listCustomers(currentUser(req), query, page));
  } catch (err) {
    next(err);
  }
}

export async function tiers(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await customersService.listTiers() });
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await customersService.getCustomer(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validate(createCustomerSchema, req.body);

    res
      .status(201)
      .json({ customer: await customersService.createCustomer(currentUser(req), input) });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(updateCustomerSchema, req.body);

    res.json({
      customer: await customersService.updateCustomer(currentUser(req), id, input),
    });
  } catch (err) {
    next(err);
  }
}
