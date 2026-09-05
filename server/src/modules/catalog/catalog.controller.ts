import type { NextFunction, Request, Response } from "express";
import { parsePageParams } from "../../common/utils/pagination.js";
import { validate } from "../../common/utils/validate.js";
import * as catalogService from "./catalog.service.js";
import { resolvePricing } from "./pricing.service.js";
import {
  idParamSchema,
  listProductsSchema,
  resolvePriceSchema,
} from "./catalog.types.js";

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = validate(listProductsSchema, req.query);
    const page = parsePageParams(req.query);

    res.json(await catalogService.listProducts(query, page));
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json({ product: await catalogService.getProduct(id) });
  } catch (err) {
    next(err);
  }
}

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json({ data: await catalogService.listCategories() });
  } catch (err) {
    next(err);
  }
}

export async function resolvePrice(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = validate(resolvePriceSchema, req.body);

    res.json(await resolvePricing(input));
  } catch (err) {
    next(err);
  }
}
