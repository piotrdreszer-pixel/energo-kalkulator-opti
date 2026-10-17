import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import type { ClientProject, EnergyAnalysis } from '@/types/database';
import { calculateProjectTotals, type PpeEntry } from '@/lib/project-totals';
import { formatCurrency, formatPercent } from '@/lib/calculation-utils';
import { exportElementToPdf } from '@/lib/pdf-export';
import { useAuth } from '@/contexts/AuthContext';
import { fmtDate, excludedLabels, NO_PPE_CONFIRM_KEY } from '@/components/project/ProjectAggregatePanel';
import logo from '@/assets/logo.png';

/* PDF palette (same as single-analysis report) */
const C = { dark: '#0d4a42', green: '#0d6b42', red: '#d32f2f', light: '#f8fafb', line: '#d5d9dd', muted: '#666' };
const PAGE_H_PX = 1123;
const PAD = 40;
const FOOTER_H = 70;
const RODO_TEXT =
  'Administratorem Pani/Pana danych osobowych jest Optienergia Sp. z o.o., ul. Chwaszczyńska 135C, 81-571 Gdynia Polska, KRS: 0001141761, NIP: 5862412424, nr REGON: 540335113. Może się Pani/Pan skontaktować z Administratorem danych, wysyłając wiadomość e-mail na adres biuro@optienergia.pl. Więcej informacji na www.optienergia.pl/rodo';

const COLS = ['4%', '26%', '26%', '14%', '15%', '15%'];
const cell: React.CSSProperties = { padding: '6px 6px', fontSize: 10, borderBottom: `1px solid ${C.line}`, wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'top' };
const money = (n: number) => formatCurrency(n);
const signColor = (v: number) => (v > 0 ? C.green : v < 0 ? C.red : '#222');

type Block = { key: string; kind: 'row' | 'block'; node: React.ReactNode };

const TableHead = () => (
  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
    <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
    <thead>
      <tr style={{ background: C.dark, color: '#fff' }}>
        {['#', 'Analiza', 'PPE / adres', 'PRZED', 'PO', 'Oszczędność'].map((h, i) => (
          <th key={h} style={{ ...cell, color: '#fff', fontWeight: 600, textAlign: i >= 3 ? 'right' : 'left', borderBottom: 'none' }}>{h}</th>
        ))}
      </tr>
    </thead>
  </table>
);

const Row = ({ i, e }: { i: number; e: PpeEntry }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
    <colgroup>{COLS.map((w, k) => <col key={k} style={{ width: w }} />)}</colgroup>
    <tbody>
      <tr style={{ background: i % 2 ? C.light : '#fff' }}>
        <td style={cell}>{i + 1}</td>
        <td style={cell}>{e.analysis.name}</td>
        <td style={cell}>{e.analysis.ppe_number || '—'}{e.analysis.ppe_address && <div style={{ color: C.muted, fontSize: 9 }}>{e.analysis.ppe_address}</div>}</td>
        <td style={{ ...cell, textAlign: 'right' }}>{money(e.result.totalCostBefore)}</td>
        <td style={{ ...cell, textAlign: 'right' }}>{money(e.result.totalCostAfter)}</td>
        <td style={{ ...cell, textAlign: 'right', color: signColor(e.result.savingsValue), fontWeight: 600 }}>{money(Math.abs(e.result.savingsValue))}</td>
      </tr>
    </tbody>
  </table>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 15, color: C.dark, margin: '18px 0 8px', fontWeight: 700 }}>{children}</h2>
);

export default function ProjectReport() {
  const { projectId } = useParams<{ projectId: string }>();
  const { profile, user } = useAuth();
  const pdfRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: project, isLoading: l1 } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_projects').select('*').eq('id', projectId).maybeSingle();
      if (error) throw error;
      return data as ClientProject | null;
    },
    enabled: !!projectId,
  });
  const { data: analyses, isLoading: l2 } = useQuery({
    queryKey: ['analyses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('energy_analyses').select('*').eq('client_project_id', projectId).order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as EnergyAnalysis[];
    },
    enabled: !!projectId,
  });

  const selected = useMemo(() => (analyses || []).filter((a) => a.include_in_project_report), [analyses]);
  const t = useMemo(() => calculateProjectTotals(selected), [selected]);
  const confirmed = projectId ? sessionStorage.getItem(NO_PPE_CONFIRM_KEY(projectId)) === '1' : false;
  const needsConfirm = t.withoutPpeNumber > 0 && selected.length > 1;
  const blockedReason =
    selected.length === 0 ? 'Nie wybrano żadnej analizy do raportu zbiorczego.'
    : t.duplicatePpe.length ? `Wybrano kilka wariantów tego samego PPE (${t.duplicatePpe.join(', ')}).`
    : needsConfirm && !confirmed ? 'Potwierdź na stronie projektu, że analizy bez numeru PPE dotyczą różnych punktów.'
    : null;

  const preparer = profile?.name || user?.email || '';
  const shown = [...t.entries];

  const blocks: Block[] = useMemo(() => {
    if (!project) return [];
    const b: Block[] = [];
    b.push({ key: 'title', kind: 'block', node: (
      <div style={{ borderBottom: `3px solid ${C.dark}`, paddingBottom: 12, marginBottom: 6 }}>
        <img src={logo} alt="Optienergia" style={{ height: 34, marginBottom: 10 }} />
        <h1 style={{ fontSize: 22, margin: 0, color: C.dark }}>Raport zbiorczy — porównanie kosztów energii</h1>
        <p style={{ fontSize: 11, margin: '6px 0 0', color: C.muted, wordBreak: 'break-word' }}>
          {project.client_name} • NIP: {project.client_nip}{project.client_address ? ` • ${project.client_address}` : ''}
        </p>
        <p style={{ fontSize: 11, margin: '2px 0 0', color: C.muted }}>
          Analizowany okres: {t.samePeriod ? `${fmtDate(t.periodFrom)} – ${fmtDate(t.periodTo)}` : 'różne okresy (patrz ograniczenia)'}{preparer ? ` • Przygotował: ${preparer}` : ''}
        </p>
      </div>
    )});
    if (t.canAggregate) {
      b.push({ key: 'summary', kind: 'block', node: (
        <div>
          <H2>Podsumowanie za analizowany okres</H2>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              ['Liczba PPE', String(selected.length), '#222'],
              ['Łączny koszt PRZED', money(t.totalBefore), '#222'],
              ['Łączny koszt PO', money(t.totalAfter), '#222'],
              ['Oszczędność', `${money(Math.abs(t.savingsValue))}`, signColor(t.savingsValue)],
              ['Oszczędność %', t.savingsPercent === null ? 'nie dotyczy' : formatPercent(Math.abs(t.savingsPercent)), signColor(t.savingsValue)],
            ].map(([l, v, c]) => (
              <div key={l} style={{ flex: 1, background: C.light, border: `1px solid ${C.line}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 9, color: C.muted }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )});
    }
    b.push({ key: 'tbl-title', kind: 'block', node: <H2>Wybrane punkty poboru (PPE)</H2> });
    shown.forEach((e, i) => b.push({ key: `row-${e.analysis.id}`, kind: 'row', node: <Row i={i} e={e} /> }));
    const limits: string[] = [];
    if (!t.samePeriod) limits.push('Analizy mają różne okresy — wyniki pokazano osobno, bez sumy. Okresy nie są przeliczane na rok.');
    if (!t.sameExclusions) limits.push('Analizy mają różny zakres wyłączonych składników — suma obejmuje różne zakresy kosztów.');
    if (t.invalid.length) limits.push(`Pominięto analizy z niekompletnymi danymi: ${t.invalid.map((e) => e.analysis.name).join(', ')}.`);
    limits.push('Kwoty pochodzą z kalkulatora w tej samej podstawie co raporty pojedynczych analiz. Wynik dotyczy analizowanego okresu, nie jest wartością roczną, o ile okres nie obejmuje pełnego roku.');
    b.push({ key: 'limits', kind: 'block', node: (
      <div>
        <H2>Zakres wyłączeń i ograniczenia analizy</H2>
        <ul style={{ fontSize: 10, margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
          {shown.filter((e) => excludedLabels(e.analysis)).map((e) => (
            <li key={e.analysis.id} style={{ wordBreak: 'break-word' }}>{e.analysis.name}: wyłączono z wyliczeń — {excludedLabels(e.analysis)}</li>
          ))}
          {limits.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>
    )});
    b.push({ key: 'det-title', kind: 'block', node: <H2>Szczegóły punktów</H2> });
    shown.forEach((e, i) => {
      const a = e.analysis, r = e.result;
      b.push({ key: `det-${a.id}`, kind: 'block', node: (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 10 }}>
          <div style={{ fontWeight: 700, color: C.dark, fontSize: 11, wordBreak: 'break-word' }}>{i + 1}. {a.name}</div>
          <div style={{ color: C.muted, wordBreak: 'break-word', margin: '2px 0 6px' }}>
            PPE: {a.ppe_number || '—'}{a.ppe_address ? ` • ${a.ppe_address}` : ''} • Okres: {fmtDate(a.period_from)} – {fmtDate(a.period_to)} • Taryfa: {a.tariff_code_before} → {a.tariff_code_after}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>PRZED: <b>{money(r.totalCostBefore)}</b></span>
            <span>PO: <b>{money(r.totalCostAfter)}</b></span>
            <span>Oszczędność: <b style={{ color: signColor(r.savingsValue) }}>{money(Math.abs(r.savingsValue))} ({r.totalCostBefore ? formatPercent(Math.abs(r.savingsPercent)) : 'nie dotyczy'})</b></span>
          </div>
        </div>
      )});
    });
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, t, preparer]);

  // Dynamic pagination: measure every block, pack into A4 pages, repeat table header.
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || !blocks.length) return;
    const avail = PAGE_H_PX - 2 * PAD - FOOTER_H;
    const headH = (root.querySelector('[data-m="head"]') as HTMLElement)?.offsetHeight || 0;
    const heights = blocks.map((bl) => (root.querySelector(`[data-m="${bl.key}"]`) as HTMLElement)?.offsetHeight || 0);
    const out: Block[][] = [[]];
    let used = 0;
    blocks.forEach((bl, i) => {
      let page = out[out.length - 1];
      const needHead = bl.kind === 'row' && (page.length === 0 || page[page.length - 1].kind !== 'row');
      const h = heights[i] + (needHead ? headH : 0);
      if (used + h > avail && page.length) {
        out.push([]);
        page = out[out.length - 1];
        used = 0;
      }
      const head = bl.kind === 'row' && (page.length === 0 || page[page.length - 1].kind !== 'row');
      if (head) { page.push({ key: `head-${i}`, kind: 'block', node: <TableHead /> }); used += headH; }
      page.push(bl);
      used += heights[i];
    });
    setPages(out);
  }, [blocks]);

  if (l1 || l2) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div className="min-h-screen flex items-center justify-center"><Button asChild><Link to="/projects">Wróć do projektów</Link></Button></div>;

  const download = async () => {
    if (!pdfRef.current) return;
    setBusy(true);
    try {
      await exportElementToPdf(pdfRef.current, {
        filename: `NIP: ${project.client_nip}_raport zbiorczy Optienergia_${preparer}`.replace(/[\\/:*?"<>|]+/g, ' '),
        marginMm: 0, scale: 2, avoidBreakSelector: '.print-avoid-break', minSliceDomPx: 200,
      });
    } finally { setBusy(false); }
  };

  const pageStyle: React.CSSProperties = { width: '210mm', height: '297mm', boxSizing: 'border-box', padding: PAD, position: 'relative', background: '#fff', fontFamily: "'Inter', system-ui, sans-serif", color: '#222' };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}`}><ArrowLeft className="h-4 w-4 mr-2" />Wróć do projektu</Link>
          </Button>
          <Button onClick={download} disabled={busy || !!blockedReason || !pages}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Pobierz PDF
          </Button>
        </div>
      </div>

      {blockedReason ? (
        <p className="text-center py-20 text-muted-foreground">{blockedReason}</p>
      ) : (
        <>
          {/* hidden measuring area, same content width as a page */}
          <div ref={measureRef} aria-hidden style={{ position: 'absolute', left: -10000, top: 0, width: `calc(210mm - ${2 * PAD}px)`, fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div data-m="head"><TableHead /></div>
            {blocks.map((bl) => <div key={bl.key} data-m={bl.key}>{bl.node}</div>)}
          </div>
          <div className="flex justify-center py-8">
            <div ref={pdfRef} data-pdf-root="true">
              {pages?.map((p, pi) => (
                <div key={pi} className="print-avoid-break" style={pageStyle}>
                  {p.map((bl) => <div key={bl.key}>{bl.node}</div>)}
                  <div style={{ position: 'absolute', left: PAD, right: PAD, bottom: 14, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
                    <p style={{ fontSize: 7, color: '#888', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>{RODO_TEXT}</p>
                    <p style={{ fontSize: 8, color: '#888', textAlign: 'right', margin: '2px 0 0' }}>Strona {pi + 1} z {pages.length}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
