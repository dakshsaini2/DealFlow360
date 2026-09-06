import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, LogOut, Package, Store } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * The customer's shell — deliberately not `AppShell`.
 *
 * There is no navigation into quotations, pipeline, approvals or catalog here
 * because none of that is theirs. Keeping it a separate component (rather than
 * `AppShell` with items filtered out) is what makes it structurally impossible
 * for a new internal nav entry to appear on the customer's screen by default.
 */
export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <Link
            to="/portal"
            className="font-display text-[17px] font-bold tracking-tight text-slate-900 no-underline"
          >
            DealFlow<span className="text-brand-600">360</span>
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Customer portal
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {[
              { to: '/portal', label: 'Browse', icon: Store },
              { to: '/portal/quotations', label: 'Quotations', icon: FileText },
              { to: '/portal/orders', label: 'Orders', icon: Package },
            ].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/portal'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium no-underline transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-slate-400 sm:inline">
              {user ? `${user.firstName} ${user.lastName}` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-transparent px-3 py-2 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-5 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
