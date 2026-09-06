import { Router } from "express";
import { isProduction } from "../../common/utils/env.js";
import { hasSmtp, readOutbox } from "../../common/utils/mailer.js";

/**
 * The development outbox.
 *
 * With no SMTP server configured, mail is captured rather than sent — this is
 * how you read the verification code or reset link during development. It is
 * mounted only outside production and holds nothing once SMTP is live, so there
 * is no path by which it can leak real messages from a deployment.
 */
export const devRouter = Router();

devRouter.get("/outbox", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  res.json({
    mailConfigured: hasSmtp,
    // Once SMTP is configured nothing is captured, so this is empty by
    // construction rather than by filtering.
    messages: readOutbox(limit),
  });
});

export const devRoutesEnabled = !isProduction;
