import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { Spinner } from '../../components/ui';
import { getApiErrorMessage } from '../../util/api';
import { checkResetToken, resetPassword } from '../../util/account';
import {
  MIN_PASSWORD_LENGTH,
  newPassword,
  required,
  useValidation,
} from '../../util/validation';

/**
 * Choosing a new password from an emailed link.
 *
 * The token is checked before the form renders, so a stale link says so
 * immediately rather than after someone has typed a password twice.
 */
export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<{ email: string; firstName: string } | null>(null);
  const [linkError, setLinkError] = useState('');
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

    checkResetToken(token, controller.signal)
      .then(setAccount)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLinkError(getApiErrorMessage(err, 'This reset link is no longer valid.'));
      });

    return () => controller.abort();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll({ password, confirm })) return;

    setLoading(true);

    try {
      await resetPassword(token!, password);
      // Deliberately not signed in automatically: the person may be on a shared
      // machine, and typing the new password once proves they have it.
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been changed. Sign in with it below.' },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'That password could not be set.'));
      setLoading(false);
    }
  }

  if (linkError) {
    return (
      <AuthLayout
        title="This link has"
        titleAccent="expired"
        subtitle="Reset links work once and are only valid for an hour."
        footer={
          <>
            Need another?{' '}
            <Link
              to="/forgot-password"
              className="font-semibold text-slate-900 no-underline transition-colors hover:text-brand-600"
            >
              Request a new link
            </Link>
          </>
        }
      >
        <FormError message={linkError} />
      </AuthLayout>
    );
  }

  if (!account) {
    return <Spinner className="min-h-screen" />;
  }

  return (
    <AuthLayout
      title="Choose a new"
      titleAccent="password"
      subtitle={`Hi ${account.firstName}, pick something you have not used here before.`}
      footer={
        <>
          Changed your mind?{' '}
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

        {/* Fixed by the link — changing it would let one token reset another
            account. */}
        <Field
          id="reset-email"
          label="Email"
          icon={Mail}
          type="email"
          value={account.email}
          readOnly
          disabled
        />

        <PasswordField
          id="reset-password"
          label="New password"
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
          id="reset-confirm"
          label="Confirm new password"
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

        <SubmitButton loading={loading}>Set new password</SubmitButton>
      </form>
    </AuthLayout>
  );
}
