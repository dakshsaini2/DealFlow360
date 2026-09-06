import { useCallback, useEffect, useState } from 'react';
import { Check, CornerUpLeft, ShieldCheck, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Spinner,
  TextAreaField,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { firstError, maxLength, required } from '../../../util/validation';
import {
  INSTANCE_TONE,
  STEP_STATE_TONE,
  actOnApproval,
  fetchApproval,
  roleLabel,
  type ApprovalActionType,
  type ApprovalDetail,
} from '../../../util/approvals';

/**
 * Mirrors `approvalActionSchema`: the note is capped at 1000 either way, but
 * rejecting or returning cannot leave it empty — the rep needs to be told what
 * to change.
 */
const REASON_RULES = [required('A reason'), maxLength(1000, 'A reason')];
const COMMENT_RULES = [maxLength(1000, 'A comment')];

/**
 * The approval chain for this quotation: which steps exist, who signed and
 * why, and — when it is this user's turn — the approve / reject / return
 * controls. Finance only appears here when the risk band actually requires it.
 */
export default function ApprovalPanel({
  quotationId,
  refreshKey,
  onDecided,
}: {
  quotationId: string;
  refreshKey: number;
  onDecided: () => void;
}) {
  const [data, setData] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<ApprovalActionType | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      fetchApproval(quotationId, signal)
        .then((result) => {
          setData(result);
          setLoading(false);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(getApiErrorMessage(err, 'Could not load the approval.'));
          setLoading(false);
        });
    },
    [quotationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load, refreshKey]);

  async function submit(action: ApprovalActionType) {
    // Rejecting or returning needs a reason, so those open a box first.
    if (action !== 'APPROVE' && pendingAction !== action) {
      setPendingAction(action);
      setReasonError('');
      return;
    }

    const invalid = firstError(reason, action === 'APPROVE' ? COMMENT_RULES : REASON_RULES);

    if (invalid) {
      setReasonError(invalid);
      return;
    }

    setReasonError('');
    setBusy(true);
    setError('');

    try {
      setData(
        await actOnApproval(quotationId, {
          action,
          ...(action === 'APPROVE'
            ? reason
              ? { comment: reason }
              : {}
            : { reason }),
        }),
      );
      setPendingAction(null);
      setReason('');
      setReasonError('');
      onDecided();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not record that decision.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  if (!data?.approval) {
    return null;
  }

  const { approval, steps, canAct } = data;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-slate-500" />
          <h2 className="text-[15px] font-semibold text-slate-900">Approval</h2>
        </div>
        <Badge tone={INSTANCE_TONE[approval.status] ?? 'neutral'}>
          {approval.status.toLowerCase()}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {approval.policy && (
          <div>
            <p className="text-[14px] font-medium text-slate-800">{approval.policy.name}</p>
            <p className="text-[12px] text-slate-400">
              risk {approval.riskScore} falls in {approval.policy.riskMin}–
              {approval.policy.riskMax}
            </p>
          </div>
        )}

        {approval.triggerReason && (
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[12px] leading-relaxed text-slate-600">
            {approval.triggerReason}
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.state === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : step.state === 'CURRENT'
                        ? 'bg-amber-100 text-amber-700'
                        : step.state === 'BLOCKED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {step.state === 'APPROVED' ? <Check size={13} /> : step.stepOrder}
                </span>
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-slate-800">
                    {roleLabel(step.role)}
                  </p>
                  <Badge tone={STEP_STATE_TONE[step.state]}>{step.state.toLowerCase()}</Badge>
                </div>

                {step.action ? (
                  <p className="mt-1 text-[12px] text-slate-500">
                    {step.action.action.toLowerCase()} by {step.action.approver.firstName}{' '}
                    {step.action.approver.lastName}
                    {(step.action.reason || step.action.comment) && (
                      <span className="mt-0.5 block italic text-slate-400">
                        “{step.action.reason ?? step.action.comment}”
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-slate-400">
                    {step.approvers.length === 0
                      ? 'no one holds this role'
                      : step.approvers
                          .map((person) => `${person.firstName} ${person.lastName}`)
                          .join(', ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {error && <ErrorBanner message={error} />}

        {canAct ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            {pendingAction && (
              <TextAreaField
                id="approval-reason"
                label={`Reason for ${pendingAction === 'REJECT' ? 'rejecting' : 'returning'}`}
                rows={3}
                autoFocus
                maxLength={1000}
                value={reason}
                error={reasonError}
                onChange={(e) => {
                  setReasonError('');
                  setReason(e.target.value);
                }}
                onBlur={() => setReasonError(firstError(reason, REASON_RULES) ?? '')}
                placeholder="Tell the rep what needs to change…"
              />
            )}

            <div className="flex flex-wrap gap-2">
              {(!pendingAction || pendingAction === 'APPROVE') && (
                <Button onClick={() => submit('APPROVE')} loading={busy} disabled={busy}>
                  <Check size={15} />
                  Approve
                </Button>
              )}
              <Button
                variant={pendingAction === 'RETURN' ? 'primary' : 'secondary'}
                onClick={() => submit('RETURN')}
                disabled={busy}
                loading={busy && pendingAction === 'RETURN'}
              >
                <CornerUpLeft size={15} />
                {pendingAction === 'RETURN' ? 'Confirm return' : 'Return'}
              </Button>
              <Button
                variant={pendingAction === 'REJECT' ? 'danger' : 'secondary'}
                onClick={() => submit('REJECT')}
                disabled={busy}
                loading={busy && pendingAction === 'REJECT'}
              >
                <X size={15} />
                {pendingAction === 'REJECT' ? 'Confirm reject' : 'Reject'}
              </Button>
              {pendingAction && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPendingAction(null);
                    setReason('');
                    setReasonError('');
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          data.blockedReason && (
            <p className="border-t border-slate-100 pt-4 text-[12px] text-slate-400">
              {data.blockedReason}.
            </p>
          )
        )}
      </div>
    </Card>
  );
}
