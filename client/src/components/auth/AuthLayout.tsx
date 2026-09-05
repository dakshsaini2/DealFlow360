import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Zap } from 'lucide-react';

type AuthLayoutProps = {
  title: string;
  titleAccent: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

export default function AuthLayout({
  title,
  titleAccent,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full  bg-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,_rgba(241,245,249,1)_0%,_transparent_60%)] pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 flex flex-col px-6 sm:px-10 lg:px-16 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Zap size={18} />
            </div>
            <span className="font-[var(--font-display)] font-bold text-xl tracking-tight text-slate-900">
              Deal<span className="text-brand-600">Flow</span>360
            </span>
          </Link>

          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-2 text-[14px] font-medium text-slate-500 no-underline hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={15} />
            Back to site
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-[420px]" style={{ animation: 'fade-up 0.7s ease-out both' }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full mb-6">
              <Sparkles size={13} className="text-brand-600" />
            </div>

            <h1 className="font-[var(--font-display)] text-[clamp(30px,3.6vw,40px)] font-extrabold leading-[1.12] tracking-[-1.2px] text-slate-900 mb-3">
              {title}{' '}
              <span className="font-[var(--font-serif)] italic font-semibold text-slate-700">
                {titleAccent}
              </span>
            </h1>

            <p className="text-[15px] leading-relaxed text-slate-500 mb-8">{subtitle}</p>

            {children}

            <div className="mt-7 text-center text-[14px] text-slate-500">{footer}</div>
          </div>
        </div>

        <p className="text-[12px] text-slate-400 text-center lg:text-left">
          © {new Date().getFullYear()} DealFlow360. All rights reserved.
        </p>
      </div>

    </div>
  );
}
