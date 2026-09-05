import {
  Search,
  SlidersHorizontal,
  FileCheck,
  Handshake,
  Layers,
} from 'lucide-react';

const steps = [
  {
    icon: Search,
    step: '01',
    title: 'Discover Deals',
    description: 'Aggregate deal sources from your network, brokers, and 50+ integrated platforms into one unified inbox.',
  },
  {
    icon: SlidersHorizontal,
    step: '02',
    title: 'Evaluate & Score',
    description: 'AI instantly scores each opportunity across financial, market, and team metrics — surfacing the best deals first.',
  },
  {
    icon: FileCheck,
    step: '03',
    title: 'Due Diligence',
    description: 'Collaborative workspaces with document management, checklists, and automated data room integration.',
  },
  {
    icon: Handshake,
    step: '04',
    title: 'Close & Manage',
    description: 'Streamlined term sheet generation, e-signatures, and post-close portfolio monitoring — all in one place.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-28 md:py-36 bg-slate-50/60" id="how-it-works">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 rounded-full mb-5">
            <Layers size={14} className="text-slate-500" />
            How It Works
          </span>
          <h2 className="font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mt-4 mb-4">
            From sourcing to close,
            <br />
            <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">in four simple steps</span>
          </h2>
          <p className="text-[17px] text-slate-500 max-w-[460px] mx-auto leading-relaxed">
            A streamlined workflow designed by investors, for investors.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="how-steps">
          {steps.map((item, i) => (
            <div
              key={i}
              className="group relative text-center p-8 pt-10 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100/80 transition-all duration-300 hover:-translate-y-1"
              id={`how-step-${i}`}
            >
              {/* Step number badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold tracking-widest text-slate-400 bg-white border border-slate-200 px-3.5 py-1 rounded-full">
                {item.step}
              </div>

              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-all duration-300">
                <item.icon size={26} />
              </div>
              <h3 className="font-[var(--font-display)] text-[18px] font-bold text-slate-800 mb-2.5 tracking-tight">
                {item.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-slate-500">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
