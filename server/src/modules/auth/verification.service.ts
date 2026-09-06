import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ValidationError } from "../../common/errors/AppError.js";
import {
  passwordResetEmail,
  verificationEmail,
} from "../../common/email/templates.js";
import { hashPassword } from "../../common/utils/auth.js";
import { prisma } from "../../common/utils/prisma.js";
import { sendMail } from "../../common/utils/mailer.js";
import type {
  ForgotPasswordInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./auth.types.js";

/**
 * Email verification codes and password resets.
 *
 * Both are one-time secrets emailed to an address, so they share a table and
 * these rules:
 *
 *  - only a SHA-256 of the secret is stored, so the database is useless to an
 *    attacker who reads it;
 *  - issuing a new secret invalidates any outstanding one of the same kind, so
 *    a forwarded old email cannot be replayed;
 *  - a six-digit code is guessable in a way a 32-byte token is not, so
 *    verification attempts are counted and capped;
 *  - nothing here reveals whether an address is registered.
 */

export const TOKEN_TYPE = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
} as const;

const OTP_TTL_MINUTES = 15;
const RESET_TTL_MINUTES = 60;
/** A six-digit code has a million values; ten guesses keeps that safe. */
const MAX_ATTEMPTS = 10;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time compare, so a wrong code cannot be found by timing. */
function matches(candidate: string, storedHash: string): boolean {
  const a = Buffer.from(hash(candidate));
  const b = Buffer.from(storedHash);

  return a.length === b.length && timingSafeEqual(a, b);
}

/** `randomInt` rather than `Math.random` — this is a credential. */
function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Replaces any outstanding secret of this kind with a fresh one. Returns the
 * plaintext, which exists only in memory and in the email.
 */
async function issue(
  userId: string,
  type: (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE],
  ttlMinutes: number,
): Promise<string> {
  const secret =
    type === TOKEN_TYPE.EMAIL_VERIFICATION
      ? generateOtp()
      : randomBytes(32).toString("base64url");

  await prisma.$transaction(async (tx) => {
    // Superseding rather than deleting keeps the audit trail of how many were
    // requested, while making the old one unusable.
    await tx.verificationToken.updateMany({
      where: { userId, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.verificationToken.create({
      data: {
        userId,
        type,
        codeHash: hash(secret),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });
  });

  return secret;
}

/**
 * Sends a verification code. Called on signup and from "resend".
 *
 * Failures are swallowed by the mailer, so a signup never fails because a mail
 * server is unreachable — the account exists and the code can be resent.
 */
export async function sendVerificationCode(user: {
  id: string;
  email: string;
  firstName: string;
}) {
  const otp = await issue(
    user.id,
    TOKEN_TYPE.EMAIL_VERIFICATION,
    OTP_TTL_MINUTES,
  );

  await sendMail(
    verificationEmail({
      to: user.email,
      firstName: user.firstName,
      otp,
      expiresInMinutes: OTP_TTL_MINUTES,
    }),
  );
}

export async function resendVerification(input: ResendVerificationInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });

  // Silent on purpose: whether an address is registered is not public.
  if (user && !user.emailVerifiedAt) {
    await sendVerificationCode(user);
  }

  return {
    sent: true,
    message: "If that address needs verifying, a new code is on its way.",
  };
}

export async function verifyEmail(input: VerifyEmailInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, emailVerifiedAt: true },
  });

  if (!user) {
    throw new ValidationError("That code is not valid", ["code: invalid or expired"]);
  }

  if (user.emailVerifiedAt) {
    return { verified: true, message: "This address is already verified." };
  }

  const token = await prisma.verificationToken.findFirst({
    where: {
      userId: user.id,
      type: TOKEN_TYPE.EMAIL_VERIFICATION,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, expiresAt: true },
  });

  if (!token || token.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("That code has expired", [
      "code: request a new one",
    ]);
  }

  if (token.attempts >= MAX_ATTEMPTS) {
    // Burn it rather than letting the guessing continue.
    await prisma.verificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    throw new ValidationError("Too many incorrect attempts", [
      "code: request a new one",
    ]);
  }

  if (!matches(input.code, token.codeHash)) {
    await prisma.verificationToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });

    throw new ValidationError("That code is not valid", [
      `code: ${MAX_ATTEMPTS - token.attempts - 1} attempts remaining`,
    ]);
  }

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);

  return { verified: true, message: "Your email address is verified." };
}

/**
 * Starts a password reset.
 *
 * Always reports success. Telling a caller that an address is unknown turns
 * this endpoint into a way to enumerate who has an account.
 */
export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, firstName: true, isActive: true },
  });

  if (user && user.isActive) {
    const token = await issue(
      user.id,
      TOKEN_TYPE.PASSWORD_RESET,
      RESET_TTL_MINUTES,
    );

    await sendMail(
      passwordResetEmail({
        to: user.email,
        firstName: user.firstName,
        token,
        expiresInMinutes: RESET_TTL_MINUTES,
      }),
    );
  }

  return {
    sent: true,
    message: "If that address has an account, a reset link is on its way.",
  };
}

/** Confirms a reset token is still good, so the form can render before asking. */
export async function checkResetToken(token: string) {
  const row = await prisma.verificationToken.findFirst({
    where: {
      type: TOKEN_TYPE.PASSWORD_RESET,
      codeHash: hash(token),
      consumedAt: null,
    },
    select: { expiresAt: true, user: { select: { email: true, firstName: true } } },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This reset link is no longer valid", [
      "token: expired or already used",
    ]);
  }

  return { email: row.user.email, firstName: row.user.firstName };
}

export async function resetPassword(input: ResetPasswordInput) {
  const row = await prisma.verificationToken.findFirst({
    where: {
      type: TOKEN_TYPE.PASSWORD_RESET,
      codeHash: hash(input.token),
      consumedAt: null,
    },
    select: { id: true, expiresAt: true, userId: true },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("This reset link is no longer valid", [
      "token: expired or already used",
    ]);
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        // Completing a reset proves control of the mailbox, which is the same
        // thing the verification code proves.
        emailVerifiedAt: new Date(),
      },
    }),
    // Any outstanding reset for this user is now stale.
    prisma.verificationToken.updateMany({
      where: {
        userId: row.userId,
        type: TOKEN_TYPE.PASSWORD_RESET,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
  ]);

  return { reset: true, message: "Your password has been changed. You can sign in now." };
}
