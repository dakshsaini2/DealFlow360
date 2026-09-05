import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { api, getApiErrorMessage, type AuthResult } from '../../util/api';

const MIN_PASSWORD_LENGTH = 8;

export default function Signup() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      return setError('Please enter your first and last name.');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    if (password !== confirmPassword) {
      return setError('Passwords do not match.');
    }

    setLoading(true);

    try {
      await api.post<AuthResult>('/auth/signup', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      navigate('/');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your"
      titleAccent="DealFlow360 account"
      subtitle="No credit card required. Get your whole pipeline scored and organized in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-slate-900 no-underline hover:text-brand-600 transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {error && <FormError message={error} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            id="signup-first-name"
            label="First name"
            icon={User}
            type="text"
            name="firstName"
            autoComplete="given-name"
            placeholder="Ada"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            required
          />

          <Field
            id="signup-last-name"
            label="Last name"
            icon={User}
            type="text"
            name="lastName"
            autoComplete="family-name"
            placeholder="Lovelace"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <Field
          id="signup-email"
          label="Work email"
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
          id="signup-password"
          label="Password"
          icon={Lock}
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
        />

        <PasswordField
          id="signup-confirm-password"
          label="Confirm password"
          icon={ShieldCheck}
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          required
        />

        <SubmitButton loading={loading}>Create Account</SubmitButton>

        <p className="text-[12px] leading-relaxed text-slate-400 text-center">
          By creating an account you agree to our{' '}
          <a href="#" className="text-slate-500 no-underline hover:text-slate-700">Terms of Service</a> and{' '}
          <a href="#" className="text-slate-500 no-underline hover:text-slate-700">Privacy Policy</a>.
        </p>
      </form>
    </AuthLayout>
  );
}
