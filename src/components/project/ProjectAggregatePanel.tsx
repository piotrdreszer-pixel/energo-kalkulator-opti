import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, FileStack } from 'lucide-react';
import type { EnergyAnalysis } from '@/types/database';
import { calculateProjectTotals } from '@/lib/project-totals';
import { formatCurrency, formatPercent } from '@/lib/calculation-utils';
import { REPORT_COMPONENTS } from '@/lib/report-components';

export const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('.') : '—');
export const excludedLabels = (a: Partial<EnergyAnalysis>) =>
  ((a.report_excluded_components as string[]) || [])
    .map((k) => REPORT_COMPONENTS.find((c) => c.key === k)?.label || k)
    .join(', ');

export const NO_PPE_CONFIRM_KEY = (scopeId: string) => `ppe-confirm-${scopeId}`;

export default function ProjectAggregatePanel({ scopeId, reportPath, analyses, readOnly = false }: { scopeId: string; reportPath: string; analyses: EnergyAnalysis[]; readOnly?: boolean }) {
  const navigate = useNavigate();
  const t = calculateProjectTotals(analyses);
  const [confirmed, setConfirmed] = useState(() => sessionStorage.getItem(NO_PPE_CONFIRM_KEY(scopeId)) === '1');
  const needsConfirm = t.withoutPpeNumber > 0 && analyses.length > 1;
  const blocked = t.duplicatePpe.length > 0 || t.invalid.length > 0 || (needsConfirm && !confirmed);
  const savingsClass = t.savingsValue > 0 ? 'text-success' : t.savingsValue < 0 ? 'text-destructive' : '';

  return (
    <Card className="mb-6 min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2">
          <FileStack className="h-5 w-5" /> Zestawienie zbiorcze
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {t.duplicatePpe.length > 0 && (
          <Warn>Wybrano kilka wariantów tego samego PPE ({t.duplicatePpe.join(', ')}). Do zestawienia można wliczyć tylko jeden wariant danego punktu — odznacz pozostałe.</Warn>
        )}
        {!t.samePeriod && (
          <Warn>Wybrane PPE mają różne okresy. Wyniki punktów pokazano osobno — ujednolić okresy, aby otrzymać sumę.</Warn>
        )}
        {t.invalid.length > 0 && (
          <Warn>Nie można wyznaczyć oszczędności — uzupełnij wariant PO. Niekompletne dane: {t.invalid.map((e) => `${e.analysis.name} (${e.missing.join(', ')})`).join('; ')}. Brakujące wartości nie są zastępowane zerem — uzupełnij dane lub odznacz te PPE, aby otrzymać podsumowanie i raport.</Warn>
        )}
        {!t.sameExclusions && (
          <Warn>Wybrane PPE mają różny zakres wyłączonych składników — suma obejmuje różne zakresy kosztów.</Warn>
        )}
        {needsConfirm && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => {
                const on = v === true;
                setConfirmed(on);
                sessionStorage.setItem(NO_PPE_CONFIRM_KEY(scopeId), on ? '1' : '0');
              }}
            />
            <span>Część punktów nie ma numeru PPE. Potwierdzam, że wybrane pozycje dotyczą różnych punktów poboru.</span>
          </label>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Obiekt</th>
                <th className="py-2 pr-2">PPE / adres</th>
                <th className="py-2 pr-2">Okres</th>
                <th className="py-2 pr-2 text-right">PRZED</th>
                <th className="py-2 pr-2 text-right">PO</th>
                <th className="py-2 text-right">Oszczędność</th>
              </tr>
            </thead>
            <tbody>
              {t.entries.map(({ analysis: a, result: r, missing }) => (
                <tr key={a.id} className="border-b align-top">
                  <td className="py-2 pr-2 break-words">{a.name}{excludedLabels(a) && <div className="text-xs text-muted-foreground">Wyłączone: {excludedLabels(a)}</div>}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{a.ppe_number || '—'}{a.ppe_address && <div className="max-w-64 whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground">{a.ppe_address}</div>}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(a.period_from)} – {fmtDate(a.period_to)}</td>
                  {missing.length ? (
                    <td colSpan={3} className="py-2 text-right text-muted-foreground">dane niekompletne</td>
                  ) : (
                    <>
                      <td className="py-2 pr-2 text-right">{formatCurrency(r.totalCostBefore)}</td>
                      <td className="py-2 pr-2 text-right">{formatCurrency(r.totalCostAfter)}</td>
                      <td className="py-2 text-right">{formatCurrency(r.savingsValue)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {t.canAggregate && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-center bg-muted/50 rounded-lg p-4">
            <Stat label="Liczba PPE" value={String(analyses.length)} />
            <Stat label="Wspólny okres" value={`${fmtDate(t.periodFrom)} – ${fmtDate(t.periodTo)}`} />
            <Stat label="Łącznie PRZED" value={formatCurrency(t.totalBefore)} />
            <Stat label="Łącznie PO" value={formatCurrency(t.totalAfter)} />
            <Stat
              label="Oszczędność za analizowany okres"
              value={`${formatCurrency(t.savingsValue)} (${t.savingsPercent === null ? 'nie dotyczy' : formatPercent(t.savingsPercent)})`}
              className={savingsClass}
            />
          </div>
        )}

        <Button disabled={blocked || readOnly} onClick={() => navigate(reportPath)}>
          Generuj raport analizy
        </Button>
      </CardContent>
    </Card>
  );
}

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 text-sm rounded-md border border-destructive/40 bg-destructive/5 p-3">
    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
    <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
  </div>
);

const Stat = ({ label, value, className = '' }: { label: string; value: string; className?: string }) => (
  <div>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`font-semibold ${className}`}>{value}</p>
  </div>
);
