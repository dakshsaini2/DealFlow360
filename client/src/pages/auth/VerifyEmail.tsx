import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { FormError, SubmitButton } from '../../components/auth/AuthForm';
import { getApiErrorMessage, homeForUser } from '../../util/api';
import { useAuth } from '../../hooks/useAuth';
import { fetchOutbox, resendVerification, verifyEmail } from '../../util/account';

/**
 * Where a new signup confirms their address.
 *
 * The code is typed rather than clicked, because it lets someone finish on the
 * machine they signed up on even if the mail arrives on their phone.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const email = params.get('email') ?? user?.email ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  // With no SMTP configured the server captures mail instead of sending it, so
  // the code is surfaced here rather than leaving the flow unwalkable.
  useEffect(() => {
    let cancelled = false;

    fetchOutbox()
      .then((result) => {
        if (cancelled || result.mailConfigured) return;

        const mine = result.messages.find(
          (message) => message.to === email && /verification code/i.test(message.subject),
        );
        const match = mine?.subject.match(/\b(\d{6})\b/);

        if (match) setDevCode(match[1]!);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [email, notice]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyEmail(email, code.trim());
      // The stored user still says unverified, so pull it again before leaving.
      const confirmed = await refresh();
      navigate(homeForUser(confirmed ?? user), { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code could not be checked.'));
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Confirm your"
      titleAccent="email address"
      subtitle={
        email
          ? `We sent a six-digit code to ${email}. Enter it below to finish setting up.`
          : 'Enter the six-digit code we emailed you.'
      }
      footer={
        <>
          Wrong address?{' '}
          <Link
            to="/signup"
            className="font-semibold text-slate-900 no-underline transition-colors hover:text-brand-600"
          >
            Sign up again
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <FormError message={error} />}

        {notice && (
          <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-700">
            {notice}
          </p>
        )}

        {devCode && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800">
            No mail server is configured, so nothing was actually sent. Your code is{' '}
            <strong className="font-mono text-[13px]">{devCode}</strong>.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="otp" className="text-[13px] font-medium text-slate-700">
            Verification code
          </label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-[24px] tracking-[0.4em] text-slate-900 outline-none placeholder:text-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>

        <SubmitButton loading={loading}>Verify my email</SubmitButton>

        <div className="flex items-center justify-between text-[13px]">
          <button
            type="button"
            onClick={async () => {
              setError('');

              try {
                const result = await resendVerification(email);
                setNotice(result.message);
                setCode('');
              } catch (err) {
                setError(getApiErrorMessage(err, 'Could not send another code.'));
              }
            }}
            className="cursor-pointer border-none bg-transparent p-0 font-medium text-slate-500 hover:text-slate-900"
          >
            Send a new code
          </button>

          {/* Verification is not a gate — it can be finished later. */}
          <button
            type="button"
            onClick={() => navigate(homeForUser(user), { replace: true })}
            className="cursor-pointer border-none bg-transparent p-0 font-medium text-slate-400 hover:text-slate-700"
          >
            I'll do this later
          </button>
        </div>
      </form>

      <p className="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-slate-400">
        <MailCheck size={14} className="mt-px shrink-0" />
        Codes expire after 15 minutes. Requesting a new one replaces the old.
      </p>
    </AuthLayout>
  );
}
