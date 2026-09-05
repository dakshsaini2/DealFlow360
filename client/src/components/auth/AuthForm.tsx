import { useState, type ComponentType, type InputHTMLAttributes } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const inputClasses =
  'w-full pl-11 pr-4 py-3 text-[15px] text-slate-800 bg-white border border-slate-200 rounded-xl outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-slate-50 disabled:text-slate-400';

export function Field({ label, icon: Icon, id, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Icon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input id={id} className={inputClasses} {...props} />
      </div>
    </div>
  );
}

export function PasswordField({ label, icon: Icon, id, hint, ...props }: FieldProps & { hint?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Icon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input id={id} type={visible ? 'text' : 'password'} className={`${inputClasses} pr-11`} {...props} />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-transparent border-none text-slate-400 cursor-pointer hover:text-slate-600 transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint && <p className="text-[12px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 px-4 py-3 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-xl"
      style={{ animation: 'fade-in 0.3s ease-out both' }}
    >
      <AlertCircle size={16} className="shrink-0 mt-px text-red-500" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex items-center justify-center gap-2.5 w-full px-6 py-3.5 bg-slate-900 text-white text-[15px] font-semibold rounded-full border-none cursor-pointer hover:bg-slate-800 transition-all duration-300 hover:-translate-y-0.5 shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-md"
    >
      {loading ? (
        <>
          <Loader2 size={17} className="animate-spin" />
          Please wait…
        </>
      ) : (
        <>
          {children}
          <ArrowRight size={17} />
        </>
      )}
    </button>
  );
}
