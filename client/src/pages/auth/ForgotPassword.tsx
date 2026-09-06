import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { Field, FormError, SubmitButton } from '../../components/auth/AuthForm';
import { getApiErrorMessage } from '../../util/api';
import { fetchOutbox, forgotPassword } from '../../util/account';
import { email as emailRule, required, useValidation } from '../../util/validation';

const RULES = { email: [required('An email address'), emailRule()] };

/**
 * Asking for a reset link.
 *
 * The confirmation is identical whether or not the address has an account — the
 * server answers that way deliberately, so this screen must not give the game
 * away by rendering something different when the address is unknown.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const { errors, validateField, validateAll, clearError } = useValidation<'email'>(RULES);

  // Without SMTP the mail is captured, so surface the link rather than leaving
  // a developer with no way through.
  useEffect(() => {
    if (!sent) return;

    fetchOutbox()
      .then((result) => {
        if (result.mailConfigured) return;

        const mine = result.messages.find(
          (entry) => entry.to === email.trim().toLowerCase() && /reset/i.test(entry.subject),
        );
        const match = mine?.text.match(/(https?:\/\/\S*\/reset-password\/\S+)/);

        if (match) setDevLink(match[1]!);
      })
      .catch(() => undefined);
  }, [sent, email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!validateAll({ email })) return;

    setLoading(true);

    try {
      const result = await forgotPassword(email.trim());
      setMessage(result.message);
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send a reset link.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your"
      titleAccent="password"
      subtitle="Tell us the address on your account and we will send a link to set a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link
            to="/login"
            className="font-semibold text-slate-900 no-underline transition-colors hover:text-brand-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
            <MailCheck size={16} className="mt-px shrink-0 text-emerald-600" />
            <span className="leading-relaxed">{message}</span>
          </div>

          {devLink && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800">
              No mail server is configured, so nothing was sent.{' '}
              <a href={devLink} className="font-semibold text-amber-900 underline">
                Open the reset link
              </a>
              .
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setSent(false);
              setDevLink(null);
            }}
            className="cursor-pointer border-none bg-transparent p-0 text-left text-[13px] font-medium text-slate-500 hover:text-slate-900"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && <FormError message={error} />}

          <Field
            id="forgot-email"
            label="Email"
            icon={Mail}
            type="email"
            value={email}
            onChange={(e) => {
              clearError('email');
              setEmail(e.target.value);
            }}
            onBlur={() => validateField('email', email)}
            error={errors.email}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />

          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
