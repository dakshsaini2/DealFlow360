import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Mail, UserPlus, X } from 'lucide-react';
import { Badge, Button, Card, ErrorBanner, Modal, Spinner, TextField } from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import {
  createPortalInvite,
  fetchPortalAccess,
  revokePortalAccess,
  revokePortalInvite,
  type PortalAccess,
} from '../../../util/invites';

/**
 * Who can see this account in the customer portal.
 *
 * Customers cannot sign themselves up — knowing a company's email address must
 * not be enough to read that company's quotations — so this panel is the only
 * way a portal login comes to exist.
 */
export default function PortalAccessPanel({ customerId }: { customerId: string }) {
  const [access, setAccess] = useState<PortalAccess | null>(null);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchPortalAccess(customerId, signal)
        .then(setAccess)
        .catch((err) => {
          if (signal?.aborted) return;
          setError(getApiErrorMessage(err, 'Could not load portal access.'));
        });
    },
    [customerId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  if (!access) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <KeyRound size={15} className="text-slate-400" />
            Portal access
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            Contacts who can review and negotiate this account's quotations.
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>
          <UserPlus size={15} />
          Invite contact
        </Button>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="flex flex-col gap-4 p-5">
        {access.members.length === 0 && access.invites.length === 0 && (
          <p className="text-[13px] text-slate-400">
            Nobody at this account can see the portal yet. Invite a contact to give them access.
          </p>
        )}

        {access.members.length > 0 && (
          <ul className="flex flex-col gap-2">
            {access.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">
                    {member.user.firstName} {member.user.lastName}
                    {member.isPrimary && (
                      <span className="ml-2">
                        <Badge tone="brand">primary</Badge>
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-slate-400">
                    {member.user.email}
                    {member.user.lastLoginAt
                      ? ` · last in ${new Date(member.user.lastLoginAt).toLocaleDateString()}`
                      : ' · never signed in'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setAccess(await revokePortalAccess(customerId, member.user.id));
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Could not revoke that access.'));
                    }
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        {access.invites.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Pending invitations
            </h3>
            <ul className="flex flex-col gap-2">
              {access.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Mail size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-800">
                        {invite.firstName} {invite.lastName}
                      </p>
                      <p className="truncate text-[12px] text-slate-400">
                        {invite.email} · invited by {invite.invitedBy.firstName} ·{' '}
                        {invite.isExpired
                          ? 'expired'
                          : `expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {invite.isExpired && <Badge tone="red">expired</Badge>}
                    <button
                      type="button"
                      aria-label={`Revoke invitation for ${invite.email}`}
                      onClick={async () => {
                        try {
                          setAccess(await revokePortalInvite(customerId, invite.id));
                        } catch (err) {
                          setError(getApiErrorMessage(err, 'Could not revoke that invitation.'));
                        }
                      }}
                      className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-300 hover:text-red-500"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {inviting && (
        <InviteDialog
          customerName={access.customer.name}
          onClose={() => setInviting(false)}
          onSubmit={async (input) => {
            setInviting(false);

            try {
              const result = await createPortalInvite(customerId, input);
              // The token is returned exactly once, so it is shown immediately
              // rather than stored anywhere it could be read back.
              setIssued({ email: input.email, url: result.inviteUrl });
              load();
            } catch (err) {
              setError(getApiErrorMessage(err, 'That invitation could not be created.'));
            }
          }}
        />
      )}

      {issued && <InviteLinkDialog issued={issued} onClose={() => setIssued(null)} />}
    </Card>
  );
}

function InviteDialog({
  customerName,
  onClose,
  onSubmit,
}: {
  customerName: string;
  onClose: () => void;
  onSubmit: (input: { email: string; firstName: string; lastName: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = email.includes('@') && firstName.trim() && lastName.trim();

  return (
    <Modal title={`Invite a contact at ${customerName}`} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          They will get a single-use link to set a password. Until they use it they have no
          account, and the link expires in 14 days.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="invite-first"
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <TextField
            id="invite-last"
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <TextField
          id="invite-email"
          label="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="procurement@customer.example"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={() => {
              setBusy(true);
              onSubmit({
                email: email.trim().toLowerCase(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
              });
            }}
          >
            Create invitation
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The link is displayed once and never again — there is no endpoint that reads
 * a token back, so this dialog is the rep's only chance to copy it. In a
 * deployment with mail configured this is where the send would happen instead.
 */
function InviteLinkDialog({
  issued,
  onClose,
}: {
  issued: { email: string; url: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Modal title="Invitation link" onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-500">
          Send this to <strong className="text-slate-800">{issued.email}</strong>. It is shown
          only now — if you lose it, revoke the invitation and issue a new one.
        </p>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{issued.url}</code>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(issued.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard blocked — the link is selectable above */
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
