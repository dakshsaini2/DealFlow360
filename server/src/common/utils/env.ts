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
} as const;

export const isProduction = env.nodeEnv === "production";
