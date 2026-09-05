import { Check, ArrowRight, Crown, Sparkles } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    description: 'Perfect for emerging fund managers and solo GPs starting their investment journey.',
    features: [
      'Up to 50 active deals',
      'AI deal scoring (basic)',
      '3 team members',
      'Email integrations',
      'Standard analytics',
      'Community support',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    price: '$149',
    period: '/month',
    description: 'For growing teams that need advanced automation and deeper insights.',
    features: [
      'Unlimited active deals',
      'AI deal scoring (advanced)',
      '15 team members',
      'CRM & data room integrations',
      'Custom workflows & automations',
      'Real-time analytics & forecasting',
      'Priority support',
      'API access',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large funds and institutions requiring maximum control and customization.',
    features: [
      'Everything in Professional',
      'Unlimited team members',
      'Custom AI model training',
      'SSO & advanced security',
      'Dedicated success manager',
      'Custom integrations',
      'SLA guarantees',
      'On-premise deployment option',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

export default function Pricing() {
  return (
    <section className="py-28 md:py-36" id="pricing">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full mb-5">
            <Crown size={14} className="text-slate-500" />
            Pricing
          </span>
          <h2 className="font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mt-4 mb-4">
            Simple, transparent
            <br />
            <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">pricing for every stage</span>
          </h2>
          <p className="text-[17px] text-slate-500 max-w-[440px] mx-auto leading-relaxed">
            Start free for 14 days. No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start max-w-[960px] mx-auto" id="pricing-grid">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative flex flex-col p-8 rounded-2xl border transition-all duration-300 hover:-translate-y-1.5 ${
                plan.popular
                  ? 'border-slate-900 bg-white shadow-xl shadow-slate-200/80 md:scale-[1.04]'
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100/80'
              }`}
              id={`pricing-card-${i}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-4 py-1 text-[12px] font-semibold text-white bg-slate-900 rounded-full whitespace-nowrap">
                  <Sparkles size={11} />
                  Most Popular
                </div>
              )}

              {/* Plan header */}
              <div className="mb-7 pb-7 border-b border-slate-100">
                <h3 className="font-[var(--font-display)] text-[20px] font-bold text-slate-800 mb-3">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="font-[var(--font-display)] text-[44px] font-extrabold text-slate-900 tracking-tight">{plan.price}</span>
                  <span className="text-[15px] text-slate-400">{plan.period}</span>
                </div>
                <p className="text-[14px] leading-relaxed text-slate-500">{plan.description}</p>
              </div>

              {/* Features */}
              <ul className="flex flex-col gap-3.5 mb-8 grow list-none">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-2.5 text-[14px] text-slate-600">
                    <Check size={16} className="text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href="#"
                className={`flex items-center justify-center gap-2 w-full py-3.5 text-[15px] font-semibold rounded-full no-underline transition-all duration-300 hover:-translate-y-0.5 ${
                  plan.popular
                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg hover:shadow-xl'
                    : 'bg-transparent text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {plan.cta}
                <ArrowRight size={15} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
