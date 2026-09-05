import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Settings,
  BarChart3,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../util/api';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Omitted means every signed-in user sees it. */
  roles?: UserRole[];
  /** Modules that are not built yet render greyed out instead of 404-ing. */
  soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/customers', label: 'Customers', icon: Users },
  { to: '/app/products', label: 'Catalog', icon: Package },
  { to: '/app/quotations', label: 'Quotations', icon: FileText },
  { to: '/app/approvals', label: 'Approvals', icon: CheckCircle2, roles: ['ADMIN', 'SALES_MANAGER', 'FINANCE'] },
  { to: '/app/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/app/invoices', label: 'Invoices', icon: Receipt },
  { to: '/app/deal-health', label: 'Deal health', icon: Activity },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/backend', label: 'Back-end', icon: Settings, roles: ['ADMIN', 'SALES_MANAGER'] },
];

export default function AppShell() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Backdrop for the mobile drawer */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 border-none bg-slate-900/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
          <Link to="/app" className="font-display text-[17px] font-bold tracking-tight text-slate-900 no-underline">
            DealFlow<span className="text-brand-600">360</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
            className="cursor-pointer border-none bg-transparent p-1 text-slate-400 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {items.map(({ to, label, icon: Icon, soon }) =>
            soon ? (
              <span
                key={to}
                title="Coming in a later module"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-slate-300"
              >
                <Icon size={17} />
                {label}
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-300">soon</span>
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === '/app'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium no-underline transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[13px] font-semibold text-white">
              {user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}` : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900">
                {user ? `${user.firstName} ${user.lastName}` : ''}
              </p>
              <p className="truncate text-[11px] text-slate-400">{user?.roles.join(' · ')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-3 py-2.5 text-[14px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-5 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="cursor-pointer border-none bg-transparent p-1 text-slate-500 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <p className="text-[13px] text-slate-400">
            Signed in as <span className="font-medium text-slate-600">{user?.email}</span>
          </p>
        </header>

        <main className="flex-1 p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
