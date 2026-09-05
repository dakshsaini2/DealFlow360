import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { homeForUser } from '../../util/api';

/**
 * The mirror of `ProtectedRoute`: pages that only make sense signed *out*.
 *
 * A stored token means the user is already in, so showing them a login form is
 * a dead end — they get sent to whichever surface is theirs. It waits for
 * `loading` for the same reason `ProtectedRoute` does: a page reload has a
 * token but no confirmed user yet, and redirecting on that gap would bounce
 * people to /login and straight back.
 */
export default function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (user) {
    // Honour wherever they were originally headed, if a guard sent them here.
    const from = (location.state as { from?: string } | null)?.from;

    return <Navigate to={from ?? homeForUser(user)} replace />;
  }

  return <Outlet />;
}
