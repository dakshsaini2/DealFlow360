import { ArrowRight, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative pt-40 pb-24 overflow-hidden" id="hero">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,_rgba(241,245,249,1)_0%,_transparent_60%)] pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 flex flex-col items-center text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full mb-8"
          style={{ animation: 'fade-up 0.7s ease-out both' }}
          id="hero-badge"
        >
          <Sparkles size={14} className="text-brand-600" />
          <span>Now with AI-Powered Deal Scoring</span>
          <ArrowRight size={13} className="text-slate-400" />
        </div>

        {/* Heading */}
        <h1
          className="font-[var(--font-display)] text-[clamp(40px,5.5vw,72px)] font-extrabold leading-[1.08] tracking-[-2px] text-slate-900 mb-6"
          style={{ animation: 'fade-up 0.7s ease-out 0.1s both' }}
          id="hero-title"
        >
          Supercharge Your
          <br />
          <span className="font-[var(--font-serif)] italic font-semibold text-slate-700">
            Deal Pipeline
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-slate-500 max-w-[580px] mb-10"
          style={{ animation: 'fade-up 0.7s ease-out 0.2s both' }}
          id="hero-subtitle"
        >
          The all-in-one platform for venture capital & private equity teams to discover,
          evaluate, and close deals — 10x faster with intelligent insights.
        </p>

        {/* CTA Buttons */}
        <div
          className="flex items-center gap-4 flex-wrap justify-center"
          style={{ animation: 'fade-up 0.7s ease-out 0.3s both' }}
          id="hero-actions"
        >
          <a
            href="/signup"
            className="inline-flex items-center gap-2.5 px-8 py-4 bg-slate-900 text-white text-[16px] font-semibold rounded-full no-underline hover:bg-slate-800 transition-all duration-300 hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
          >
            Get Started
            <ArrowRight size={18} />
          </a>
        </div>

        {/* Trust Signals */}
        <div
          className="flex items-center gap-3.5 mt-12"
          style={{ animation: 'fade-up 0.7s ease-out 0.4s both' }}
          id="hero-trust"
        >
          <div className="flex">
            {['S', 'J', 'A', 'M', 'K'].map((letter, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-full border-2 border-white -ml-2 first:ml-0 overflow-hidden"
              >
                <div
                  className={`w-full h-full flex items-center justify-center text-[12px] font-bold text-white ${
                    ['bg-slate-700', 'bg-slate-500', 'bg-slate-600', 'bg-slate-400', 'bg-slate-800'][i]
                  }`}
                >
                  {letter}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[14px] font-bold text-slate-800">Businesses</span>
            <span className="text-[12px] text-slate-400">already closing deals faster</span>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div
          className="relative w-full max-w-[940px] mt-16"
          style={{ animation: 'scale-in 0.9s ease-out 0.5s both' }}
          id="hero-visual"
        >
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="w-3 h-3 rounded-full bg-slate-200" />
                <span className="w-3 h-3 rounded-full bg-slate-200" />
              </div>
              <span className="text-[12px] text-slate-400 font-medium">DealFlow360 — Pipeline Overview</span>
              <div className="w-10" />
            </div>

            {/* Dashboard Content */}
            <div className="p-6 flex flex-col gap-5">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Active Deals', value: '147', change: '+12%', positive: true },
                  { label: 'Pipeline Value', value: '$2.4B', change: '+28%', positive: true },
                  { label: 'Win Rate', value: '68%', change: '+5%', positive: true },
                  { label: 'Avg. Close Time', value: '23d', change: '-15%', positive: true },
                ].map((stat, i) => (
                  <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:border-slate-200 transition-colors">
                    <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">{stat.label}</div>
                    <div className="font-[var(--font-display)] text-2xl md:text-[28px] font-bold text-slate-800 mt-1">{stat.value}</div>
                    <div className="text-[12px] font-semibold text-emerald-500 mt-0.5">{stat.change}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/30">
                <div className="flex justify-between mb-4">
                  <span className="text-[13px] text-slate-600 font-medium">Deal Flow Trend</span>
                  <span className="text-[12px] text-slate-400">Last 6 months</span>
                </div>
                <div className="flex items-end gap-2 h-[100px]">
                  {[35, 50, 40, 65, 55, 78, 68, 85, 75, 90, 82, 95].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-slate-200 rounded-t hover:bg-brand-500 transition-colors duration-200 cursor-default"
                      style={{
                        height: `${h}%`,
                        animation: `bar-grow 0.5s ease-out ${i * 0.06}s both`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
