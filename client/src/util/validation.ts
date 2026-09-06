import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Client-side field validation.
 *
 * These rules deliberately mirror the Zod schemas the API validates against —
 * they are a courtesy so a typo is caught before a round trip, never the only
 * check. Anything the server rejects still surfaces through `getApiErrorMessage`.
 */

/** Returns an error message when the value is unacceptable, or null when it is fine. */
export type Rule = (value: string) => string | null;

/** Rules for the optional fields only run when something has been typed. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_SHAPE_RE = /^[+()\-.\s\d]+$/;
// Letters (any script), marks, spaces and the punctuation real names contain.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

export const required =
  (label = 'This field'): Rule =>
  (value) =>
    value.trim() ? null : `${label} is required.`;

export const email = (): Rule => (value) => {
  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.length > 254) return 'That email address is too long.';

  return EMAIL_RE.test(trimmed)
    ? null
    : 'Enter a valid email address, like name@company.com.';
};

export const phone = (): Rule => (value) => {
  const trimmed = value.trim();

  if (!trimmed) return null;
  if (!PHONE_SHAPE_RE.test(trimmed)) {
    return 'A phone number can only contain digits, spaces and + ( ) - .';
  }

  const digits = trimmed.replace(/\D/g, '');

  return digits.length >= 7 && digits.length <= 15
    ? null
    : 'Enter a phone number with 7 to 15 digits.';
};

export const personName =
  (label: string): Rule =>
  (value) => {
    const trimmed = value.trim();

    if (!trimmed) return null;

    return NAME_RE.test(trimmed)
      ? null
      : `${label} can only contain letters, spaces, hyphens and apostrophes.`;
  };

export const minLength =
  (length: number, label = 'This field'): Rule =>
  (value) => {
    const trimmed = value.trim();

    if (!trimmed) return null;

    return trimmed.length >= length
      ? null
      : `${label} must be at least ${length} characters.`;
  };

export const maxLength =
  (length: number, label = 'This field'): Rule =>
  (value) =>
    value.trim().length <= length
      ? null
      : `${label} must be at most ${length} characters.`;

export const pattern =
  (test: RegExp, message: string): Rule =>
  (value) =>
    !value.trim() || test.test(value.trim()) ? null : message;

/**
 * A numeric field typed as text. `integer` rejects a fractional entry, which is
 * what quantities need — the server rejects those too.
 */
export const numeric =
  ({
    min,
    max,
    integer,
    label = 'This field',
  }: { min?: number; max?: number; integer?: boolean; label?: string }): Rule =>
  (value) => {
    const trimmed = value.trim();

    if (!trimmed) return null;

    const parsed = Number(trimmed);

    if (!Number.isFinite(parsed)) return `${label} must be a number.`;
    if (integer && !Number.isInteger(parsed)) return `${label} must be a whole number.`;
    if (min !== undefined && parsed < min) return `${label} cannot be less than ${min}.`;
    if (max !== undefined && parsed > max) return `${label} cannot be more than ${max}.`;

    return null;
  };

export const percent = (label = 'Discount'): Rule => numeric({ min: 0, max: 100, label });

/** New passwords only. Sign-in just needs the field filled in. */
export const MIN_PASSWORD_LENGTH = 8;

export const newPassword = (): Rule => (value) => {
  if (!value) return null;
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include at least one letter and one number.';
  }

  return null;
};

/** Rejects a date already in the past, compared by day rather than by instant. */
export const notPast =
  (label = 'That date'): Rule =>
  (value) => {
    if (!value) return null;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) return `${label} is not a valid date.`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return parsed >= today ? null : `${label} cannot be in the past.`;
  };

/** First failure wins, so one field never shows a stack of messages. */
export function firstError(value: string, rules: Rule[] = []): string | null {
  for (const rule of rules) {
    const message = rule(value);
    if (message) return message;
  }

  return null;
}

export type RuleSet<K extends string> = Partial<Record<K, Rule[]>>;
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Field errors for one form.
 *
 * Fields are checked on blur and again on submit, so nothing is flagged red
 * before it has been filled in once. The rule set is re-read on every call,
 * which lets a rule close over another field — password confirmation, for
 * instance — without the hook needing to know about it.
 */
export function useValidation<K extends string>(rules: RuleSet<K>) {
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  });

  const [errors, setErrors] = useState<FieldErrors<K>>({});

  /** Checks one field, usually from `onBlur`. */
  const validateField = useCallback((key: K, value: string) => {
    const message = firstError(value, rulesRef.current[key]);

    setErrors((current) => ({ ...current, [key]: message ?? undefined }));

    return message === null;
  }, []);

  /** Checks every field with a rule. Call on submit; false means do not send. */
  const validateAll = useCallback((values: Partial<Record<K, string>>) => {
    const next: FieldErrors<K> = {};

    for (const key of Object.keys(rulesRef.current) as K[]) {
      const message = firstError(values[key] ?? '', rulesRef.current[key]);
      if (message) next[key] = message;
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }, []);

  /** Drops a field's error while it is being retyped. */
  const clearError = useCallback((key: K) => {
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }, []);

  const setError = useCallback((key: K, message: string) => {
    setErrors((current) => ({ ...current, [key]: message }));
  }, []);

  return { errors, validateField, validateAll, clearError, setError };
}
