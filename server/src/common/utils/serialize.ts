/**
 * Prisma returns money and percentage columns as `Decimal` objects, which
 * `JSON.stringify` renders as strings ("1234.50"). Every response goes through
 * `serialize` so the client always receives plain numbers and ISO dates.
 */

type Decimalish = { toNumber: () => number; toFixed: (dp?: number) => string };

function isDecimal(value: object): value is Decimalish {
  return (
    typeof (value as Decimalish).toNumber === "function" &&
    typeof (value as Decimalish).toFixed === "function"
  );
}

export type Serialized<T> = T extends Decimalish
  ? number
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

/** Deep-converts `Decimal` to `number` and `Date` to an ISO string. */
export function serialize<T>(value: T): Serialized<T> {
  return convert(value) as Serialized<T>;
}

function convert(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isDecimal(value)) {
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(convert);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, convert(entry)]),
  );
}

/** Rounds to 2 decimal places without float drift (12.345 -> 12.35). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
