import { ArrowRight, Rocket } from 'lucide-react';

export default function CTASection() {
  return (
    <section className="py-28 md:py-36" id="cta">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="relative rounded-3xl border border-slate-200 bg-slate-50 overflow-hidden">
          {/* Subtle dot pattern */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle, #64748b 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative z-10 py-20 md:py-24 px-8 md:px-12 flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 mb-7 shadow-sm"
              style={{ animation: 'float 4s ease-in-out infinite' }}
            >
              <Rocket size={28} />
            </div>

            <h2 className="font-[var(--font-display)] text-[clamp(28px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mb-4">
              Ready to transform your
              <br />
              <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">deal pipeline?</span>
            </h2>

            <div className="flex items-center gap-4 flex-wrap justify-center">
              <a
                href="/signup"
                className="inline-flex items-center gap-2.5 px-8 py-4 bg-slate-900 text-white text-[16px] font-semibold rounded-full no-underline hover:bg-slate-800 transition-all duration-300 hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
              >
                Signup
                <ArrowRight size={18} />
              </a>
              <a
                href="/login"
                className="inline-flex items-center gap-2.5 px-8 py-4 bg-white text-slate-700 text-[16px] font-semibold rounded-full no-underline border border-slate-200 hover:border-slate-300 hover:bg-white transition-all duration-300 hover:-translate-y-0.5 shadow-sm"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
