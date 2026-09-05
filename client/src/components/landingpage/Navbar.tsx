import { useState, useEffect } from 'react';
import { Menu, X, ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-sm py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 no-underline" id="nav-logo">
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white">
            <Zap size={18} />
          </div>
          <span className="font-[var(--font-display)] font-bold text-xl tracking-tight text-slate-900">
            Deal<span className="text-brand-600">Flow</span>360
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-1" id="nav-links-desktop">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="no-underline text-slate-500 text-[14px] font-medium px-4 py-2 rounded-full transition-colors duration-200 hover:text-slate-900 hover:bg-slate-100/70"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <Link to="/login" className="text-slate-500 text-[14px] font-medium no-underline hover:text-slate-900 transition-colors" id="nav-signin">
            Sign In
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-[14px] font-semibold rounded-full no-underline hover:bg-slate-800 transition-all duration-300 hover:-translate-y-0.5 shadow-md hover:shadow-lg"
            id="nav-cta"
          >
            Get Started <ArrowRight size={15} />
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden bg-transparent border-none text-slate-700 cursor-pointer p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          id="nav-toggle"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`fixed inset-0 bg-white/98 backdrop-blur-xl flex flex-col items-center justify-center gap-2 z-[999] transition-all duration-500 ${
          menuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        id="nav-mobile-menu"
      >
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="no-underline text-slate-500 text-lg font-medium px-6 py-3 rounded-xl hover:text-slate-900 hover:bg-slate-50 transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </a>
        ))}
        <div className="mt-6 w-[200px] flex flex-col items-center gap-3">
          <Link
            to="/signup"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-900 text-white font-semibold rounded-full no-underline"
            onClick={() => setMenuOpen(false)}
          >
            Get Started <ArrowRight size={16} />
          </Link>
          <Link
            to="/login"
            className="text-slate-500 text-[15px] font-medium no-underline hover:text-slate-900 transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}
