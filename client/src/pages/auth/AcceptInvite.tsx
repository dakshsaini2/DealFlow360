import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, Lock, Mail } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { Spinner } from '../../components/ui';
import { clearAuth, getApiErrorMessage, setStoredUser, setToken } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';
import { acceptInvite, fetchInvite, type InviteDetails } from '../../util/invites';
import {
  MIN_PASSWORD_LENGTH,
  newPassword,
  required,
  useValidation,
} from '../../util/validation';

/**
 * Where an invited customer lands.
 *
 * They have no account until they submit this form, so the page is public — but
 * the token in the URL is single-use, expiring and never stored in plaintext.
 * Accepting signs them in directly, so the link ends on their quotations rather
 * than on a login form they would have to fill in twice.
 */
export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { errors, validateField, validateAll, clearError } = useValidation({
    password: [required('A password'), newPassword()],
    confirm: [
      required('The confirmation'),
      (value: string) => (value === password ? null : 'Both passwords must match.'),
    ],
  });

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetchInvite(token, controller.signal)
      .then(setInvite)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(
          getApiErrorMessage(err, 'This invitation link is no longer valid.'),
        );
      });

    return () => controller.abort();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll({ password, confirm })) return;

    setLoading(true);

    try {
      const result = await acceptInvite(token!, password);

      // Accepting hands back a session for the *invited* person. Anyone else
      // signed in on this browser is being replaced, so drop their session
      // explicitly rather than letting one overwrite the other.
      clearAuth();
      setToken(result.token);
      setStoredUser(result.user);
      // A full navigation lets AuthProvider re-read the stored session rather
      // than starting from its already-null state.
      window.location.assign('/portal');
    } catch (err) {
      setError(getApiErrorMessage(err, 'That invitation could not be accepted.'));
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <AuthLayout
        title="This link has"
        titleAccent="expired"
        subtitle="Invitation links are single-use and time-limited."
        footer={
          <>
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-slate-900 no-underline transition-colors hover:text-brand-600"
            >
              Sign in
            </Link>
          </>
        }
      >
        <FormError message={loadError} />
        <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
          Ask your account manager to send you a fresh invitation.
        </p>
      </AuthLayout>
    );
  }

  if (!invite) {
    return <Spinner className="min-h-screen" />;
  }

  return (
    <AuthLayout
      title="Set up your"
      titleAccent="portal access"
      subtitle={`${invite.firstName}, you have been invited to review quotations for ${invite.customerName}.`}
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-slate-900 no-underline transition-colors hover:text-brand-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <FormError message={error} />}

        {/* Usually the rep who sent it, testing the link on their own machine. */}
        {user && user.email !== invite.email && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800">
            You are signed in as <strong>{user.email}</strong>. Setting a password here signs you
            out and activates access for {invite.email} instead.
          </p>
        )}

        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <Building2 size={16} className="shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900">{invite.customerName}</p>
            <p className="truncate text-[12px] text-slate-500">
              {invite.firstName} {invite.lastName}
            </p>
          </div>
        </div>

        {/* The address is fixed by the invitation — changing it would let a
            forwarded link be claimed by whoever received it. */}
        <Field
          id="invite-email"
          label="Email"
          icon={Mail}
          type="email"
          value={invite.email}
          readOnly
          disabled
        />

        <PasswordField
          id="invite-password"
          label="Choose a password"
          icon={Lock}
          value={password}
          onChange={(e) => {
            clearError('password');
            setPassword(e.target.value);
          }}
          onBlur={() => validateField('password', password)}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          required
        />

        <PasswordField
          id="invite-confirm"
          label="Confirm password"
          icon={Lock}
          value={confirm}
          onChange={(e) => {
            clearError('confirm');
            setConfirm(e.target.value);
          }}
          onBlur={() => validateField('confirm', confirm)}
          error={errors.confirm}
          placeholder="Type it again"
          autoComplete="new-password"
          required
        />

        <SubmitButton loading={loading}>Activate my access</SubmitButton>
      </form>
    </AuthLayout>
  );
}
