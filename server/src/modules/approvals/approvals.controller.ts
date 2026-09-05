import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./approvals.service.js";
import { actSchema, idParamSchema, listQueueSchema } from "./approvals.types.js";

export async function queue(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(listQueueSchema, req.query);

    res.json({ data: await service.listQueue(currentUser(req), query) });
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);

    res.json(await service.getApproval(currentUser(req), id));
  } catch (err) {
    next(err);
  }
}

export async function act(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validate(idParamSchema, req.params);
    const input = validate(actSchema, req.body);

    res.json(await service.act(currentUser(req), id, input, req));
  } catch (err) {
    next(err);
  }
}
