import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, PasswordField, SubmitButton } from '../../components/auth/AuthForm';
import { getApiErrorMessage, homeForUser } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';
import {
  MIN_PASSWORD_LENGTH,
  email as emailRule,
  maxLength,
  newPassword,
  personName,
  required,
  useValidation,
} from '../../util/validation';

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Declared inline so the confirmation rule can close over `password` — the
  // hook re-reads the rule set on every call, so it always sees the latest.
  const { errors, validateField, validateAll, clearError } = useValidation({
    firstName: [required('A first name'), personName('A first name'), maxLength(100, 'A first name')],
    lastName: [required('A last name'), personName('A last name'), maxLength(100, 'A last name')],
    email: [required('An email address'), emailRule()],
    password: [required('A password'), newPassword()],
    confirmPassword: [
      required('The confirmation'),
      (value: string) => (value === password ? null : 'Both passwords must match.'),
    ],
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll({ firstName, lastName, email, password, confirmPassword })) return;

    setLoading(true);

    try {
      const user = await signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });

      // `PublicOnlyRoute` redirects the moment the session exists — to the
      // verification screen for a new account — so this is only the fallback
      // for the already-verified case.
      navigate(homeForUser(user), { replace: true });
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
            onChange={(e) => {
              clearError('firstName');
              setFirstName(e.target.value);
            }}
            onBlur={() => validateField('firstName', firstName)}
            error={errors.firstName}
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
            onChange={(e) => {
              clearError('lastName');
              setLastName(e.target.value);
            }}
            onBlur={() => validateField('lastName', lastName)}
            error={errors.lastName}
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
          onChange={(e) => {
            clearError('email');
            setEmail(e.target.value);
          }}
          onBlur={() => validateField('email', email)}
          error={errors.email}
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
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}
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

        <PasswordField
          id="signup-confirm-password"
          label="Confirm password"
          icon={ShieldCheck}
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => {
            clearError('confirmPassword');
            setConfirmPassword(e.target.value);
          }}
          onBlur={() => validateField('confirmPassword', confirmPassword)}
          error={errors.confirmPassword}
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
