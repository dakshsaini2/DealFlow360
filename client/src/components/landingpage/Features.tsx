import {
  Brain,
  BarChart3,
  Shield,
  Workflow,
  Globe,
  Bell,
  type LucideIcon,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Brain,
    title: 'AI Deal Scoring',
    description: 'Machine learning models analyze 200+ data points to score and rank every deal in your pipeline automatically.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description: 'Interactive dashboards with live pipeline metrics, conversion funnels, and predictive forecasting at your fingertips.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SOC 2 Type II compliant with end-to-end encryption, role-based access control, and audit trails for every action.',
  },
  {
    icon: Workflow,
    title: 'Smart Workflows',
    description: 'Automate due diligence, approvals, and follow-ups with customizable workflow templates and triggers.',
  },
  {
    icon: Globe,
    title: 'Global Deal Sourcing',
    description: 'Connect to 50+ deal sources worldwide. Aggregate opportunities from networks, brokers, and proprietary channels.',
  },
  {
    icon: Bell,
    title: 'Intelligent Alerts',
    description: 'Get notified about deal stage changes, competitor activity, and market signals that impact your portfolio.',
  },
];

export default function Features() {
  return (
    <section className="py-28 md:py-36" id="features">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full mb-5">
            <Brain size={14} className="text-slate-500" />
            Features
          </span>
          <h2 className="font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mt-4 mb-4">
            Everything you need to
            <br />
            <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">dominate deal flow</span>
          </h2>
          <p className="text-[17px] text-slate-500 max-w-[520px] mx-auto leading-relaxed">
            Purpose-built tools for investment professionals who refuse to settle for spreadsheets and outdated CRMs.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" id="features-grid">
          {features.map((feature, i) => (
            <div
              key={i}
              className="group p-8 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100/80 transition-all duration-300 hover:-translate-y-1 cursor-default"
              id={`feature-card-${i}`}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 mb-5 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-all duration-300">
                <feature.icon size={22} />
              </div>
              <h3 className="font-[var(--font-display)] text-[18px] font-bold text-slate-800 mb-2.5 tracking-tight">
                {feature.title}
              </h3>
              <p className="text-[14.5px] leading-relaxed text-slate-500">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
