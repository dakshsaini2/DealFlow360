import { useEffect, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';

interface MetricData {
  value: number;
  suffix: string;
  prefix?: string;
  label: string;
  sublabel: string;
}

const metrics: MetricData[] = [
  { value: 2400, suffix: '+', label: 'Teams Worldwide', sublabel: 'Active on the platform' },
  { value: 12, suffix: 'B', prefix: '$', label: 'Pipeline Tracked', sublabel: 'In deal value managed' },
  { value: 68, suffix: '%', label: 'Faster Close Rate', sublabel: 'Compared to industry avg' },
  { value: 99.9, suffix: '%', label: 'Uptime SLA', sublabel: 'Enterprise reliability' },
];

function AnimatedCounter({ target, prefix = '', suffix, duration = 2000 }: { target: number; prefix?: string; suffix: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * target);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [started, target, duration]);

  const display = target % 1 !== 0 ? count.toFixed(1) : Math.floor(count).toLocaleString();

  return (
    <div ref={ref} className="font-[var(--font-display)] text-[clamp(34px,4vw,50px)] font-extrabold tracking-[-1px] text-slate-900">
      {prefix}{display}{suffix}
    </div>
  );
}

export default function Metrics() {
  return (
    <section className="py-28 md:py-36" id="metrics">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full mb-5">
            <TrendingUp size={14} className="text-slate-500" />
            By The Numbers
          </span>
          <h2 className="font-[var(--font-display)] text-[clamp(30px,3.5vw,44px)] font-extrabold tracking-[-1px] leading-tight text-slate-900 mt-4 mb-4">
            Trusted by the world's
            <br />
            <span className="font-[var(--font-serif)] italic font-semibold text-slate-600">top investment teams</span>
          </h2>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="metrics-grid">
          {metrics.map((m, i) => (
            <div
              key={i}
              className="text-center p-10 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100/80 transition-all duration-300 hover:-translate-y-1"
              id={`metric-card-${i}`}
            >
              <AnimatedCounter target={m.value} prefix={m.prefix} suffix={m.suffix} />
              <div className="text-[15px] font-semibold text-slate-700 mt-2">{m.label}</div>
              <div className="text-[13px] text-slate-400 mt-1">{m.sublabel}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
