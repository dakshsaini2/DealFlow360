import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

/* ── Buttons ────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

const BUTTON_VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:hover:bg-slate-900',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
  ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;

export function Button({ variant = 'primary', loading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        variant === 'secondary' ? '' : 'border-none'
      } ${BUTTON_VARIANTS[variant]} ${className} cursor-pointer`}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ── Form fields ────────────────────────────────────── */

const CONTROL_CLASSES =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400';

const CONTROL_TONES = {
  normal: 'border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10',
  invalid: 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10',
} as const;

function controlClasses(error?: string) {
  return `${CONTROL_CLASSES} ${error ? CONTROL_TONES.invalid : CONTROL_TONES.normal}`;
}

type LabelledProps = {
  label: string;
  action?: ReactNode;
  hint?: string;
  id: string;
  /** When set, the control turns red and this replaces the hint. */
  error?: string;
};

/**
 * The message under a field. It is `role="alert"` so a screen reader announces
 * a validation failure the moment it appears, and `aria-describedby` on the
 * control ties the two together.
 */
function FieldMessage({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} role="alert" className="text-[12px] font-medium text-red-600">
        {error}
      </p>
    );
  }

  return hint ? (
    <p id={`${id}-hint`} className="text-[12px] text-slate-400">
      {hint}
    </p>
  ) : null;
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;

  return hint ? `${id}-hint` : undefined;
}

export function TextField({
  label,
  action,
  hint,
  id,
  error,
  ...props
}: LabelledProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
        </label>
        {action}
      </div>
      <input
        id={id}
        className={controlClasses(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

/**
 * A multi-line field. Addresses use this rather than `TextField`, since a
 * street address on one line is unreadable the moment it is longer than the box.
 */
export function TextAreaField({
  label,
  action,
  hint,
  id,
  error,
  rows = 3,
  className = '',
  ...props
}: LabelledProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
        </label>
        {action}
      </div>
      <textarea
        id={id}
        rows={rows}
        className={`${controlClasses(error)} min-h-[96px] resize-y leading-relaxed ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  action,
  hint,
  id,
  error,
  children,
  ...props
}: LabelledProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
        </label>
        {action}
      </div>
      <select
        id={id}
        className={`${controlClasses(error)} cursor-pointer`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {children}
      </select>
      <FieldMessage id={id} hint={hint} error={error} />
    </div>
  );
}

/**
 * A checkbox with its label to the right. Used for "same as billing" and other
 * inline switches inside a form column.
 */
export function CheckboxField({
  id,
  label,
  description,
  ...props
}: { id: string; label: string; description?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 transition-colors hover:border-slate-300"
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 cursor-pointer accent-brand-600"
        {...props}
      />
      <span>
        <span className="block text-[13px] font-medium text-slate-800">{label}</span>
        {description && <span className="block text-[12px] text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/* ── Feedback ───────────────────────────────────────── */

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700"
    >
      <AlertCircle size={16} className="mt-px shrink-0 text-red-500" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Loader2 size={22} className="animate-spin text-slate-400" />
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <p className="text-[15px] font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-slate-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ── Display ────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const MODAL_WIDTHS = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
} as const;

/** Centred overlay dialog. Escape/backdrop close is handled by the caller. */
export function Modal({
  title,
  onClose,
  children,
  width = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `lg` and `xl` give multi-line fields such as addresses room to breathe. */
  width?: keyof typeof MODAL_WIDTHS;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 border-none bg-transparent" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${MODAL_WIDTHS[width]} rounded-2xl border border-slate-200 bg-white shadow-xl`}
      >
        <h2 className="border-b border-slate-100 px-5 py-4 text-[16px] font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
