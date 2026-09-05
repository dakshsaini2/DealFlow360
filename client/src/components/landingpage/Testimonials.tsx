import { useState } from 'react';
import { Quote, ChevronLeft, ChevronRight, Star, MessageSquare } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Managing Partner',
    company: 'Vertex Capital',
    initials: 'SC',
    bg: 'bg-slate-700',
    rating: 5,
    text: 'DealFlow360 transformed how we source and evaluate deals. Our pipeline velocity increased by 3x in the first quarter. The AI scoring alone saved us hundreds of hours.',
  },
  {
    name: 'Marcus Rivera',
    role: 'VP of Investments',
    company: 'Horizon Equity',
    initials: 'MR',
    bg: 'bg-slate-500',
    rating: 5,
    text: 'We went from juggling 12 spreadsheets to one unified platform. The real-time analytics give our investment committee unprecedented visibility into our deal funnel.',
  },
  {
    name: 'Aisha Patel',
    role: 'Principal',
    company: 'Nexus Ventures',
    initials: 'AP',
    bg: 'bg-slate-600',
    rating: 5,
    text: 'The workflow automation is incredible. Due diligence that used to take 3 weeks now takes 5 days. This is the future of investment management.',
  },
  {
    name: 'David Kim',
    role: 'CTO',
    company: 'BluePeak Partners',
    initials: 'DK',
    bg: 'bg-slate-800',
    rating: 5,
    text: 'Enterprise-grade security with a consumer-grade experience. Our team adopted it in days, not months. The API integrations with our existing stack were seamless.',
  },
];

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);
  const goTo = (dir: -1 | 1) => setActiveIndex((prev) => (prev + dir + testimonials.length) % testimonials.length);

  const TestimonialCard = ({ t }: { t: typeof testimonials[number] }) => (
    <div className="p-8 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100/80 transition-all duration-300 hover:-translate-y-1">
      <Quote size={20} className="text-slate-200 mb-4" />
      <div className="flex gap-1 mb-4">
        {Array.from({ length: t.rating }).map((_, s) => (
          <Star key={s} size={14} fill="#f59e0b" color="#f59e0b" />
        ))}
      </div>
      <p className="text-[15px] leading-[1.75] text-slate-500 mb-6 italic">"{t.text}"</p>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0 ${t.bg}`}>
          {t.initials}
        </div>
        <div>
          <div className="text-[14px] font-semibold text-slate-800">{t.name}</div>
          <div className="text-[13px] text-slate-400">{t.role}, {t.company}</div>
        </div>
      </div>
    </div>
  );

  return (
    <section className="py-28 md:py-36 bg-slate-50/60" id="testimonials">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium text-slate-600 bg-white border border-slate-200 rounded-full mb-5">
            <MessageSquare size={14} className="text-slate-500" />
            Testimonials
          </span>
          <h2 className="font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mt-4">
            Loved by investment
            <br />
            <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">professionals worldwide</span>
          </h2>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:grid grid-cols-2 gap-5" id="testimonials-grid">
          {testimonials.map((t, i) => <TestimonialCard key={i} t={t} />)}
        </div>

        {/* Mobile Carousel */}
        <div className="md:hidden" id="testimonials-carousel">
          <TestimonialCard t={testimonials[activeIndex]} />
          <div className="flex items-center justify-center gap-4 mt-6">
            <button onClick={() => goTo(-1)} className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors cursor-pointer" aria-label="Previous">
              <ChevronLeft size={20} />
            </button>
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  className={`h-2 rounded-full border-none cursor-pointer transition-all duration-200 p-0 ${
                    i === activeIndex ? 'w-6 bg-slate-800' : 'w-2 bg-slate-300'
                  }`}
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>
            <button onClick={() => goTo(1)} className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors cursor-pointer" aria-label="Next">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
