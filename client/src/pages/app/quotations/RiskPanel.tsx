import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge, Card } from '../../../components/ui';
import { riskBand, type RiskBreakdown } from '../../../util/quotations';

/**
 * Shows the blended risk score and, more importantly, *why* it is what it is —
 * an approver needs to see which lines broke their ceiling and whether margin
 * or discount drove the number.
 */
export default function RiskPanel({
  risk,
  approvalRequired,
}: {
  risk: RiskBreakdown;
  approvalRequired: boolean;
}) {
  const band = riskBand(risk.score);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Blended risk</h2>
        <Badge tone={band.tone}>{band.label}</Badge>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-end gap-3">
          <span className="font-display text-[34px] font-bold leading-none tracking-tight text-slate-900">
            {risk.score}
          </span>
          <span className="pb-1 text-[13px] text-slate-400">/ 100</span>
        </div>

        <Meter label="Discount excess" value={risk.discountRisk} />
        <Meter label="Margin shortfall" value={risk.marginRisk} />

        <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-[12px]">
          <Figure label="Avg over ceiling" value={`${risk.weightedExcessPercent} pts`} />
          <Figure label="Worst line" value={`${risk.maxExcessPercent} pts`} />
          <Figure
            label="Order margin"
            value={risk.marginPercent === null ? '—' : `${risk.marginPercent}%`}
          />
          <Figure label="Lines over limit" value={String(risk.offendingLines.length)} />
        </dl>

        <p
          className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-[13px] ${
            approvalRequired
              ? 'bg-amber-50 text-amber-800'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {approvalRequired ? (
            <AlertTriangle size={15} className="mt-px shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="mt-px shrink-0" />
          )}
          <span>
            {approvalRequired
              ? 'This quotation will be routed for approval automatically when sent.'
              : 'No approval needed — this can go straight to the customer.'}
            <span className="mt-1 block text-[12px] opacity-80">{risk.reason}</span>
          </span>
        </p>

        {risk.offendingLines.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <Info size={13} />
              Over their ceiling
            </p>
            <ul className="flex flex-col gap-1.5">
              {risk.offendingLines.map((line) => (
                <li
                  key={line.sku}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px]"
                >
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium">{line.sku}</span>
                    <span className="text-slate-400"> · {line.categoryName}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-amber-700">
                    {line.discountPercent}% vs {line.maxDiscountPercent}% (+{line.excessPercent})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-700">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            value >= 60 ? 'bg-red-500' : value >= 25 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
