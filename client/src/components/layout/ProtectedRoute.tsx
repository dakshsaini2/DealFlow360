import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../util/api';

/**
 * Gates a route subtree. While the stored token is being verified it renders a
 * spinner rather than redirecting, so a page reload does not bounce a signed-in
 * user out to /login.
 */
export default function ProtectedRoute({
  roles,
  /**
   * Where a signed-in user without the required role is sent. It defaults to
   * the internal workspace, but the portal and workspace subtrees point at each
   * other so each role lands on the surface that is actually theirs.
   */
  redirectTo = '/app',
}: {
  roles?: UserRole[];
  redirectTo?: string;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !user.roles.some((role) => roles.includes(role))) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
