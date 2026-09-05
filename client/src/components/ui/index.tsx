import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
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
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50 disabled:text-slate-400';

type LabelledProps = { label: string; hint?: string; id: string };

export function TextField({
  label,
  hint,
  id,
  ...props
}: LabelledProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <input id={id} className={CONTROL_CLASSES} {...props} />
      {hint && <p className="text-[12px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  id,
  children,
  ...props
}: LabelledProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <select id={id} className={`${CONTROL_CLASSES} cursor-pointer`} {...props}>
        {children}
      </select>
      {hint && <p className="text-[12px] text-slate-400">{hint}</p>}
    </div>
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

/** Centred overlay dialog. Escape/backdrop close is handled by the caller. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 border-none bg-transparent" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <h2 className="border-b border-slate-100 px-5 py-4 text-[16px] font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
