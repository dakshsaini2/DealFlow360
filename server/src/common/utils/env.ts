import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }

  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: number("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  saltRounds: number("BCRYPT_SALT_ROUNDS", 10),

  /**
   * Where links in outgoing mail point. The server never sees the browser's
   * origin, so it has to be told.
   */
  appUrl: process.env.APP_URL ?? "http://localhost:5173",

  /**
   * Browser origins allowed to call the API, comma-separated. Behind the
   * container's reverse proxy the client is same-origin and this is never
   * consulted; it matters when the two are served separately, as in `npm run
   * dev`.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Runs pending migrations and the demo seed at boot. Used by the container. */
  autoMigrate: process.env.AUTO_MIGRATE === "true",

  /**
   * SMTP is optional. With no host configured the mailer falls back to a
   * development outbox that logs each message instead of sending it, so the
   * whole verification and invitation flow works without credentials.
   */
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: number("SMTP_PORT", 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "DealFlow360 <no-reply@dealflow360.com>",
  },
} as const;

/** True when real mail can actually be sent. */
export const hasSmtp = Boolean(env.smtp.host && env.smtp.user);

export const isProduction = env.nodeEnv === "production";
