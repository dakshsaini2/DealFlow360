import nodemailer, { type Transporter } from "nodemailer";
import { env, hasSmtp } from "./env.js";

/**
 * Outgoing mail.
 *
 * SMTP is optional on purpose. Without credentials the mailer writes each
 * message to an in-memory outbox and logs it, so email verification, password
 * resets and portal invitations all work end to end on a laptop with nothing
 * configured — and the same code path sends for real the moment `SMTP_HOST` is
 * set. A demo that silently does nothing without a mail server would be worse
 * than one that shows you the message it would have sent.
 */

export type Mail = {
  to: string;
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Plain-text fallback, for clients that will not render HTML. */
  text: string;
};

export type SentMail = Mail & {
  id: string;
  sentAt: string;
  /** `smtp` when it actually left the building, `outbox` when it was captured. */
  via: "smtp" | "outbox";
};

/**
 * The last N messages, newest first. Only used when SMTP is not configured —
 * it exists so a developer or a demo can read the OTP that was just "sent".
 */
const OUTBOX_LIMIT = 50;
const outbox: SentMail[] = [];

let transporter: Transporter | null = null;

/**
 * Announced once at boot. Config is read at module load, so a `.env` edit needs
 * a restart to take effect — printing the resolved mode makes a stale process
 * obvious rather than something you discover from a surprising UI message.
 */
console.log(
  hasSmtp
    ? `📧 Mail: sending via ${env.smtp.host}:${env.smtp.port} as ${env.smtp.user}`
    : "📧 Mail: no SMTP configured — messages are captured in the dev outbox",
);

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    });
  }

  return transporter;
}

/**
 * Sends a message, or captures it when SMTP is not configured.
 *
 * A failure here never throws. Signing up, resetting a password and inviting a
 * contact are all operations whose *state change has already committed* by the
 * time mail goes out — bubbling a transport error would tell the user their
 * action failed when it did not. Failures are logged and reported through the
 * return value instead.
 */
export async function sendMail(mail: Mail): Promise<SentMail> {
  const record: SentMail = {
    ...mail,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sentAt: new Date().toISOString(),
    via: hasSmtp ? "smtp" : "outbox",
  };

  if (!hasSmtp) {
    outbox.unshift(record);
    outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);

    console.log(
      `\n📧 [outbox] To: ${mail.to}\n   Subject: ${mail.subject}\n${mail.text
        .split("\n")
        .map((line) => `   ${line}`)
        .join("\n")}\n`,
    );

    return record;
  }

  try {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (err) {
    // Logged, not thrown: the account was still created, the reset token is
    // still valid, the invitation still exists.
    console.error(`Failed to send "${mail.subject}" to ${mail.to}:`, err);

    // Capture it as well. Without this a configured-but-broken mail server
    // leaves the recipient with no code and no way to reach one, which is a
    // worse failure than not having SMTP at all.
    const failed: SentMail = { ...record, via: "outbox" };

    outbox.unshift(failed);
    outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);

    return failed;
  }

  return record;
}

/** The development outbox, newest first. Empty once SMTP is configured. */
export function readOutbox(limit = 20): SentMail[] {
  return outbox.slice(0, limit);
}

export { hasSmtp };
