import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { getApiErrorMessage } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
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

        <Field
          id="login-email"
          label="Email address"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@firm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />

        <PasswordField
          id="login-password"
          label="Password"
          icon={Lock}
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
        />

        <SubmitButton loading={loading}>Sign In</SubmitButton>
      </form>
    </AuthLayout>
  );
}
