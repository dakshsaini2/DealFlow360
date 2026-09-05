import {
  Zap,
  MessageCircle,
  Briefcase,
  ExternalLink,
  Mail,
  ArrowUpRight,
} from 'lucide-react';

const footerLinks = {
  Product: ['Features', 'Pricing', 'Integrations', 'Changelog', 'Roadmap'],
  Company: ['About', 'Blog', 'Careers', 'Press', 'Partners'],
  Resources: ['Documentation', 'API Reference', 'Guides', 'Community', 'Status'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Security', 'GDPR', 'Cookies'],
};

export default function Footer() {
  return (
    <footer className="pt-20 bg-slate-50 border-t border-slate-200" id="footer">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_2fr] gap-16 pb-12">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <a href="#" className="flex items-center gap-2.5 no-underline">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                <Zap size={16} />
              </div>
              <span className="font-[var(--font-display)] font-bold text-[18px] text-slate-900">
                Deal<span className="text-brand-600">Flow</span>360
              </span>
            </a>
            <p className="text-[14px] text-slate-400 leading-relaxed max-w-[260px]">
              The AI-powered deal pipeline platform for modern investment teams.
            </p>
            <div className="flex gap-2.5 mt-2">
              {[
                { icon: MessageCircle, label: 'Social' },
                { icon: Briefcase, label: 'LinkedIn' },
                { icon: ExternalLink, label: 'GitHub' },
                { icon: Mail, label: 'Email' },
              ].map((s, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 no-underline hover:text-slate-700 hover:border-slate-300 hover:bg-white transition-all duration-200"
                  aria-label={s.label}
                >
                  <s.icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="font-[var(--font-display)] text-[13px] font-semibold text-slate-800 mb-4 tracking-wide uppercase">
                  {category}
                </h4>
                <ul className="list-none flex flex-col gap-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="group inline-flex items-center gap-1 text-[13.5px] text-slate-400 no-underline hover:text-slate-700 transition-colors duration-200">
                        {link}
                        <ArrowUpRight size={11} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-slate-400" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-slate-200" />

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-center justify-between py-6 gap-2">
          <p className="text-[13px] text-slate-400">© {new Date().getFullYear()} DealFlow360. All rights reserved.</p>
          <p className="text-[13px] text-slate-400">Built with precision for investment professionals.</p>
        </div>
      </div>
    </footer>
  );
}
