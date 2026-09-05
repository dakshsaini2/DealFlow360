import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../util/api';
import { currency } from '../../../util/catalog';
import { tierTone } from '../../../util/customers';
import { riskBand } from '../../../util/quotations';
import {
  STEP_STATE_TONE,
  fetchApprovalQueue,
  roleLabel,
  type QueueRow,
} from '../../../util/approvals';

export default function ApprovalsQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);

      fetchApprovalQueue(scope, signal)
        .then((result) => {
          setRows(result);
          setError('');
          setLoading(false);
        })
        .catch((err) => {
          if (signal.aborted) return;
          setError(getApiErrorMessage(err, 'Could not load the approval queue.'));
          setLoading(false);
        });
    },
    [scope],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
        subtitle="Quotations routed here automatically by their blended risk score."
        action={
          <div className="flex gap-2">
            <Button
              variant={scope === 'mine' ? 'primary' : 'secondary'}
              onClick={() => setScope('mine')}
            >
              Awaiting me
            </Button>
            <Button
              variant={scope === 'all' ? 'primary' : 'secondary'}
              onClick={() => setScope('all')}
            >
              All pending
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Card>
          <Spinner />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={scope === 'mine' ? 'Nothing awaiting you' : 'Nothing pending'}
            description={
              scope === 'mine'
                ? 'Quotations needing your sign-off will appear here the moment they are sent.'
                : 'No quotation is currently in an approval chain.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => {
            const band = riskBand(row.riskScore);

            return (
              <Card key={row.quotation.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/app/quotations/${row.quotation.id}`}
                        className="text-[15px] font-semibold text-slate-900 no-underline hover:text-brand-600"
                      >
                        {row.quotation.quoteNumber}
                      </Link>
                      <Badge tone={band.tone}>risk {row.riskScore}</Badge>
                      <Badge tone={tierTone(row.quotation.customer.customerTier?.name)}>
                        {row.quotation.customer.customerTier?.name ?? 'no tier'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-600">
                      {row.quotation.customer.name} ·{' '}
                      {currency.format(row.quotation.grandTotal)} · owned by{' '}
                      {row.quotation.salesRep.firstName} {row.quotation.salesRep.lastName}
                    </p>
                    {row.triggerReason && (
                      <p className="mt-1.5 text-[12px] text-slate-400">{row.triggerReason}</p>
                    )}
                  </div>

                  <Link to={`/app/quotations/${row.quotation.id}`} className="no-underline">
                    <Button variant={row.canAct ? 'primary' : 'secondary'}>
                      <ShieldCheck size={15} />
                      {row.canAct ? 'Review' : 'View'}
                    </Button>
                  </Link>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {row.policyName}
                  </span>
                  {row.chain.map((step) => (
                    <Badge key={step.stepOrder} tone={STEP_STATE_TONE[step.state]}>
                      {roleLabel(step.role)}
                    </Badge>
                  ))}
                  {!row.canAct && row.blockedReason && (
                    <span className="text-[12px] text-slate-400">· {row.blockedReason}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
