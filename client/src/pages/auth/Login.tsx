import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { getApiErrorMessage, homeForUser } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';
import { email as emailRule, required, useValidation } from '../../util/validation';

/**
 * Sign-in only checks the shape of the address and that a password was typed.
 * Password *strength* rules belong on signup and reset — applying them here
 * would lock out an older account whose password predates them.
 */
const RULES = {
  email: [required('An email address'), emailRule()],
  password: [required('A password')],
};

type FieldName = keyof typeof RULES;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const state = location.state as { from?: string; notice?: string } | null;
  const from = state?.from ?? null;
  const notice = state?.notice ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { errors, validateField, validateAll, clearError } = useValidation<FieldName>(RULES);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll({ email, password })) return;

    setLoading(true);

    try {
      const user = await login(email.trim(), password);

      // A portal user has no internal workspace to land on, so the default
      // destination follows the role rather than being hard-coded to /app.
      navigate(from ?? homeForUser(user), { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not sign you in. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to your"
      titleAccent="deal pipeline"
      subtitle="Pick up where you left off — your deals, scores, and notes are exactly as you left them."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-slate-900 no-underline hover:text-brand-600 transition-colors">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {error && <FormError message={error} />}

        {/* Set by the reset flow, so the change is confirmed where they land. */}
        {notice && (
          <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
            {notice}
          </p>
        )}

        <Field
          id="login-email"
          label="Email address"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@firm.com"
          value={email}
          onChange={(e) => {
            clearError('email');
            setEmail(e.target.value);
          }}
          onBlur={() => validateField('email', email)}
          error={errors.email}
          disabled={loading}
          required
        />

        <div className="flex flex-col gap-1.5">
          <PasswordField
            id="login-password"
            label="Password"
            icon={Lock}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              clearError('password');
              setPassword(e.target.value);
            }}
            onBlur={() => validateField('password', password)}
            error={errors.password}
            disabled={loading}
            required
          />
          <Link
            to="/forgot-password"
            className="self-end text-[13px] font-medium text-slate-500 no-underline transition-colors hover:text-brand-600"
          >
            Forgot your password?
          </Link>
        </div>

        <SubmitButton loading={loading}>Sign In</SubmitButton>
      </form>
    </AuthLayout>
  );
}
