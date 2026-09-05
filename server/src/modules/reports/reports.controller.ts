import type { NextFunction, Request, Response } from "express";
import { currentUser } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/utils/validate.js";
import * as service from "./reports.service.js";
import { salesReportSchema } from "./reports.types.js";

export async function sales(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(salesReportSchema, req.query);

    res.json(await service.salesReport(currentUser(req), query));
  } catch (err) {
    next(err);
  }
}

/**
 * The spreadsheet export. CSV rather than a real .xlsx: every spreadsheet opens
 * it, it streams, and it adds no dependency. The PDF half of "PDF / XLS" is the
 * browser's own print-to-PDF against the report's print stylesheet.
 */
export async function salesCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validate(salesReportSchema, req.query);
    const report = await service.salesReport(currentUser(req), query);
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dealflow360-sales-${stamp}.csv"`,
    );
    // Excel needs the BOM to read UTF-8 rather than the local codepage.
    res.send(`﻿${service.toCsv(report)}`);
  } catch (err) {
    next(err);
  }
}
