import { env } from "../utils/env.js";
import type { Mail } from "../utils/mailer.js";

/**
 * Message bodies.
 *
 * Deliberately plain: one column, inline styles, no images and no external
 * assets, because every mail client renders that reliably and none of them
 * render a modern stylesheet. Each template also ships real plain text rather
 * than a stripped-tags approximation, so the fallback reads properly.
 */

const BRAND = "#2563eb";

function layout(heading: string, body: string, footer?: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
      <tr>
        <td style="padding:24px 28px 0;">
          <p style="margin:0;font-size:17px;font-weight:700;letter-spacing:-0.02em;">
            DealFlow<span style="color:${BRAND};">360</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 28px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${heading}</h1>
          ${body}
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#94a3b8;text-align:center;">
      ${footer ?? "If you were not expecting this email you can safely ignore it."}
    </p>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0;">
    <a href="${href}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;">${label}</a>
  </p>
  <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;">
    Or paste this into your browser:<br /><span style="color:#475569;">${href}</span>
  </p>`;
}

/** The six-digit code shown large enough to read at a glance. */
function code(value: string): string {
  return `<p style="margin:20px 0;font-size:32px;font-weight:700;letter-spacing:0.32em;color:#0f172a;">${value}</p>`;
}

export function verificationEmail(options: {
  to: string;
  firstName: string;
  otp: string;
  expiresInMinutes: number;
}): Mail {
  return {
    to: options.to,
    subject: `${options.otp} is your DealFlow360 verification code`,
    html: layout(
      "Confirm your email",
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
         Hi ${options.firstName}, enter this code to finish setting up your account.
       </p>
       ${code(options.otp)}
       <p style="margin:0;font-size:13px;color:#64748b;">
         It expires in ${options.expiresInMinutes} minutes.
       </p>`,
      "If you did not create a DealFlow360 account, you can ignore this email.",
    ),
    text: [
      `Hi ${options.firstName},`,
      "",
      `Your DealFlow360 verification code is: ${options.otp}`,
      `It expires in ${options.expiresInMinutes} minutes.`,
      "",
      "If you did not create an account, you can ignore this email.",
    ].join("\n"),
  };
}

export function passwordResetEmail(options: {
  to: string;
  firstName: string;
  token: string;
  expiresInMinutes: number;
}): Mail {
  const href = `${env.appUrl}/reset-password/${options.token}`;

  return {
    to: options.to,
    subject: "Reset your DealFlow360 password",
    html: layout(
      "Reset your password",
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
         Hi ${options.firstName}, use the link below to choose a new password. It
         works once and expires in ${options.expiresInMinutes} minutes.
       </p>
       ${button(href, "Choose a new password")}`,
      "If you did not ask to reset your password, nothing has changed and you can ignore this email.",
    ),
    text: [
      `Hi ${options.firstName},`,
      "",
      "Use this link to choose a new DealFlow360 password:",
      href,
      "",
      `It works once and expires in ${options.expiresInMinutes} minutes.`,
      "",
      "If you did not ask for this, nothing has changed.",
    ].join("\n"),
  };
}

export function portalInviteEmail(options: {
  to: string;
  firstName: string;
  customerName: string;
  invitedBy: string;
  invitePath: string;
  expiresAt: Date;
}): Mail {
  const href = `${env.appUrl}${options.invitePath}`;
  const expires = options.expiresAt.toISOString().slice(0, 10);

  return {
    to: options.to,
    subject: `${options.invitedBy} invited you to the ${options.customerName} portal`,
    html: layout(
      "You have been invited",
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
         Hi ${options.firstName}, ${options.invitedBy} has given you access to the
         DealFlow360 portal for <strong>${options.customerName}</strong>. You can
         review quotations, ask questions and request changes there — no email
         back and forth.
       </p>
       ${button(href, "Set up your access")}
       <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
         This link works once and expires on ${expires}.
       </p>`,
      "If you were not expecting this, you can ignore this email.",
    ),
    text: [
      `Hi ${options.firstName},`,
      "",
      `${options.invitedBy} has given you access to the DealFlow360 portal for ${options.customerName}.`,
      "",
      "Set up your access here:",
      href,
      "",
      `This link works once and expires on ${expires}.`,
    ].join("\n"),
  };
}
