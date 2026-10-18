import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { ClientProject } from '@/types/database';
import type { ProjectTotals, PpeEntry } from '@/lib/project-totals';
import { formatCurrency, formatPercent } from '@/lib/calculation-utils';
import { fmtDate } from '@/components/project/ProjectAggregatePanel';
import logo from '@/assets/logo.png';
import coverPattern from '@/assets/pdf/cover-pattern.svg';
import iconEnergy from '@/assets/pdf/icon-energy.svg';
import iconChart from '@/assets/pdf/icon-chart.svg';
import iconPower from '@/assets/pdf/icon-power.svg';
import iconSavings from '@/assets/pdf/icon-savings.svg';
import {
  PAGE_W, PAGE_H, RODO_TEXT, pageBase, pageBreak, RodoFooter, InfoRow, CostBar, ParamCardsGrid,
  buildCostRows, thStyle, tdStyle, type CostRow,
} from './AnalysisPdfDocument';

/* Same spacing as the single-analysis report pages */
const PAD_TOP = 40;
const PAD_X = 40;
const PAD_BOTTOM = 76; // room for the absolute RODO footer
const CONTENT_W = PAGE_W - 2 * PAD_X;
const HEADER_H_GUESS = 52;
const H_FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const DARK = '#0d4a42';
const GREEN = '#1a8a5a';
const RED = '#d32f2f';

const signColor = (v: number) => (v > 0 ? GREEN : v < 0 ? RED : '#333');
const diffText = (v: number) => `${v > 0 ? '−' : v < 0 ? '+' : ''}${formatCurrency(Math.abs(v))}`;
const hiddenOf = (e: PpeEntry) => [
  ...((e.analysis.report_hidden_components as string[]) || []),
  ...((e.analysis.report_excluded_components as string[]) || []),
];

type Section = 'table' | 'details' | 'end';
type Block = { key: string; section: Section; kind: 'row' | 'block'; node: React.ReactNode };

const SECTION_TITLES: Record<Section, { title: string; icon: string }> = {
  table: { title: 'Zestawienie punktów poboru', icon: iconChart },
  details: { title: 'Szczegóły punktów poboru', icon: iconPower },
  end: { title: 'Podsumowanie', icon: iconSavings },
};

const PageHeader = ({ title, icon }: { title: string; icon: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
    <img src={icon} alt="" style={{ width: 28, height: 28 }} />
    <h2 style={{ fontFamily: H_FONT, fontSize: 22, fontWeight: 700, color: DARK, margin: 0 }}>{title}</h2>
    <div style={{ flex: 1 }} />
    <img src={logo} alt="" style={{ height: 24, opacity: 0.5 }} />
  </div>
);

/* ── PPE list table (fixed layout, so split rows keep column widths) ── */
const COLS = ['5%', '29%', '12%', '15%', '15%', '15%', '9%'];
const tcell: React.CSSProperties = { ...tdStyle, padding: '8px 8px', fontSize: 11, verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'anywhere' };
const Cols = () => <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;

const PpeTableHead = () => (
  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
    <Cols />
    <thead>
      <tr style={{ background: DARK }}>
        {['#', 'Obiekt / PPE', 'Taryfa', 'PRZED [zł]', 'PO [zł]', 'Oszczędność [zł]', '%'].map((h, i) => (
          <th key={h} style={{ ...thStyle, padding: '10px 8px', fontSize: 11, textAlign: i >= 3 ? 'right' : 'left', borderRadius: i === 0 ? '8px 0 0 0' : i === 6 ? '0 8px 0 0' : 0 }}>{h}</th>
        ))}
      </tr>
    </thead>
  </table>
);

const PpeRow = ({ i, e, showTariff }: { i: number; e: PpeEntry; showTariff: boolean }) => {
  const a = e.analysis, r = e.result;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <Cols />
      <tbody>
        <tr style={{ background: i % 2 === 0 ? '#f8fafb' : '#fff' }}>
          <td style={tcell}>{i + 1}</td>
          <td style={tcell}>
            <div style={{ fontWeight: 600, color: '#222' }}>{a.name}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>PPE: {a.ppe_number || '—'}</div>
          </td>
          <td style={tcell}>{showTariff ? `${a.tariff_code_before} → ${a.tariff_code_after}` : '—'}</td>
          <td style={{ ...tcell, textAlign: 'right', whiteSpace: 'nowrap', wordBreak: 'normal' }}>{formatCurrency(r.totalCostBefore)}</td>
          <td style={{ ...tcell, textAlign: 'right', whiteSpace: 'nowrap', wordBreak: 'normal' }}>{formatCurrency(r.totalCostAfter)}</td>
          <td style={{ ...tcell, textAlign: 'right', fontWeight: 600, color: signColor(r.savingsValue) }}>{formatCurrency(Math.abs(r.savingsValue))}</td>
          <td style={{ ...tcell, textAlign: 'right', color: signColor(r.savingsValue) }}>{r.totalCostBefore ? formatPercent(Math.abs(r.savingsPercent)) : 'n/d'}</td>
        </tr>
      </tbody>
    </table>
  );
};

/* ── Cost table in the same style as page 2 of the single report ── */
function CostTable({ rows, totalBefore, totalAfter, compact }: { rows: CostRow[]; totalBefore: number; totalAfter: number; compact?: boolean }) {
  const td = compact ? { ...tdStyle, padding: '7px 12px', fontSize: 11 } : tdStyle;
  const th = compact ? { ...thStyle, padding: '9px 12px', fontSize: 11 } : thStyle;
  const sav = totalBefore - totalAfter;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: DARK }}>
          <th style={{ ...th, textAlign: 'left', borderRadius: '8px 0 0 0' }}>Składnik kosztu</th>
          <th style={{ ...th, textAlign: 'right' }}>PRZED [zł]</th>
          <th style={{ ...th, textAlign: 'right' }}>PO [zł]</th>
          <th style={{ ...th, textAlign: 'right', borderRadius: '0 8px 0 0' }}>Różnica [zł]</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const diff = row.before - row.after;
          return (
            <tr key={row.key} style={{ background: i % 2 === 0 ? '#f8fafb' : '#fff' }}>
              <td style={td}>{row.label}</td>
              <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(row.before)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(row.after)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: signColor(diff) }}>{diffText(diff)}</td>
            </tr>
          );
        })}
        <tr style={{ background: '#e8f5f0', fontWeight: 700 }}>
          <td style={td}>RAZEM</td>
          <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(totalBefore)}</td>
          <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(totalAfter)}</td>
          <td style={{ ...td, textAlign: 'right', color: signColor(sav) }}>{diffText(sav)}</td>
        </tr>
      </tbody>
    </table>
  );
}

interface Props {
  project: ClientProject;
  groupName: string;
  totals: ProjectTotals;
  osdNames: Record<string, string>;
  preparerName: string;
  preparerEmail?: string;
  onPaginated?: () => void;
}

export default function MultiPpePdfDocument({ project, groupName, totals: t, osdNames, preparerName, preparerEmail, onPaginated }: Props) {
  const dateStr = format(new Date(), 'd MMMM yyyy', { locale: pl });
  const entries = t.entries;
  const agg = t.canAggregate;
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);

  /* Summed cost components: a row is shown only when visible in every PPE (no hidden data leaks). */
  const aggRows = useMemo<CostRow[]>(() => {
    if (!entries.length) return [];
    const perPpe = entries.map((e) => ({ rows: buildCostRows(e.analysis, e.result), hidden: hiddenOf(e) }));
    return perPpe[0].rows
      .filter((row) => perPpe.every((p) => !p.hidden.includes(row.key)))
      .map((row) => {
        const sum = (f: 'before' | 'after') => perPpe.reduce((s, p) => s + (p.rows.find((r) => r.key === row.key)?.[f] || 0), 0);
        return { ...row, label: row.key === 'contractedPower' ? 'Opłata za moc umowną' : row.label, before: sum('before'), after: sum('after') };
      });
  }, [entries]);
  const someRowsOmitted = entries.length > 0 && aggRows.length < buildCostRows(entries[0].analysis, entries[0].result).length;

  const blocks = useMemo<Block[]>(() => {
    const b: Block[] = [];
    b.push({ key: 'tbl-intro', section: 'table', kind: 'block', node: (
      <p style={{ fontSize: 12, color: '#777', margin: '0 0 14px', lineHeight: 1.5 }}>
        Punkty poboru energii uwzględnione w analizie „{groupName}”. Kwoty za okres analizy.
      </p>
    )});
    entries.forEach((e, i) => b.push({ key: `row-${e.analysis.id}`, section: 'table', kind: 'row', node: (
      <PpeRow i={i} e={e} showTariff={!hiddenOf(e).includes('distribution')} />
    )}));
    if (agg) {
      b.push({ key: 'tbl-sum', section: 'table', kind: 'row', node: (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <Cols />
          <tbody>
            <tr style={{ background: '#e8f5f0', fontWeight: 700 }}>
              <td style={tcell} colSpan={3}>RAZEM ({entries.length} PPE)</td>
              <td style={{ ...tcell, textAlign: 'right', whiteSpace: 'nowrap', wordBreak: 'normal' }}>{formatCurrency(t.totalBefore)}</td>
              <td style={{ ...tcell, textAlign: 'right', whiteSpace: 'nowrap', wordBreak: 'normal' }}>{formatCurrency(t.totalAfter)}</td>
              <td style={{ ...tcell, textAlign: 'right', color: signColor(t.savingsValue) }}>{formatCurrency(Math.abs(t.savingsValue))}</td>
              <td style={{ ...tcell, textAlign: 'right', color: signColor(t.savingsValue) }}>{t.savingsPercent === null ? 'n/d' : formatPercent(Math.abs(t.savingsPercent))}</td>
            </tr>
          </tbody>
        </table>
      )});
    }
    const notes: string[] = [];
    if (!t.samePeriod) notes.push('Punkty mają różne okresy analizy — wyniki pokazano osobno, bez sumy.');
    if (!t.sameExclusions) notes.push('Punkty mają różny zakres składników uwzględnionych w wyliczeniach.');
    if (notes.length) b.push({ key: 'tbl-notes', section: 'table', kind: 'block', node: (
      <div style={{ marginTop: 12, fontSize: 10.5, color: '#666', lineHeight: 1.5 }}>{notes.map((n) => <p key={n} style={{ margin: 0 }}>• {n}</p>)}</div>
    )});

    entries.forEach((e, i) => {
      const a = e.analysis, r = e.result;
      const hidden = hiddenOf(e);
      const isVisible = (k: string) => !hidden.includes(k);
      const osd = a.osd_id ? osdNames[a.osd_id] : undefined;
      const meta = [
        `Okres: ${fmtDate(a.period_from)} – ${fmtDate(a.period_to)}`,
        isVisible('distribution') ? `Taryfa: ${a.tariff_code_before} → ${a.tariff_code_after}` : null,
        osd ? `OSD: ${osd}` : null,
      ].filter(Boolean).join('  •  ');
      b.push({ key: `det-${a.id}`, section: 'details', kind: 'block', node: (
        <div style={{ paddingTop: i === 0 ? 0 : 10 }}>
          <div style={{ background: 'linear-gradient(135deg, #0d4a42, #1a6b5a)', borderRadius: 14, padding: '14px 22px', color: '#fff', marginBottom: 12 }}>
            <p style={{ fontSize: 10, margin: 0, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Punkt {i + 1} z {entries.length}</p>
            <p style={{ fontFamily: H_FONT, fontSize: 17, fontWeight: 700, margin: '4px 0 2px', wordBreak: 'break-word' }}>{a.name}</p>
            <p style={{ fontSize: 12, margin: 0, color: 'rgba(255,255,255,0.85)', wordBreak: 'break-word' }}>
              PPE: {a.ppe_number || '—'}{a.ppe_address ? `  •  ${a.ppe_address}` : ''}
            </p>
            <p style={{ fontSize: 11, margin: '4px 0 0', color: 'rgba(255,255,255,0.65)', wordBreak: 'break-word' }}>{meta}</p>
          </div>
          <ParamCardsGrid analysis={a} results={r} isVisible={isVisible} />
        </div>
      )});
      b.push({ key: `cost-${a.id}`, section: 'details', kind: 'block', node: (
        <div style={{ marginTop: 12 }}>
          <CostTable rows={buildCostRows(a, r).filter((row) => isVisible(row.key))} totalBefore={r.totalCostBefore} totalAfter={r.totalCostAfter} compact />
          <div style={{ marginTop: 10, background: 'linear-gradient(135deg, #e8f5f0, #dff0ea)', border: '1px solid #c8e6d8', borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={iconSavings} alt="" style={{ width: 24, height: 24, opacity: 0.7 }} />
            <span style={{ fontSize: 12, color: '#666' }}>Oszczędność punktu za okres analizy</span>
            <span style={{ marginLeft: 'auto', fontFamily: H_FONT, fontSize: 18, fontWeight: 800, color: r.savingsValue >= 0 ? '#0d6b42' : RED }}>
              {formatCurrency(Math.abs(r.savingsValue))} • {r.totalCostBefore ? formatPercent(Math.abs(r.savingsPercent)) : 'n/d'}
            </span>
          </div>
        </div>
      )});
      if (a.consultant_notes) {
        b.push({ key: `note-${a.id}`, section: 'details', kind: 'block', node: (
          <div style={{ marginTop: 14, background: 'linear-gradient(135deg, #f8fafb, #f0f4f3)', borderRadius: 14, padding: '18px 22px', border: '1px solid #d5ddd9', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, #0d6b42, #1a8a5a)' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: DARK, margin: '0 0 2px', fontFamily: H_FONT }}>Rekomendacja doradcy energetycznego</p>
            <p style={{ fontSize: 10.5, color: '#777', margin: '0 0 8px', wordBreak: 'break-word' }}>dotyczy: {a.name} (PPE: {a.ppe_number || '—'})</p>
            <p style={{ fontSize: 12, color: '#444', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingLeft: 6 }}>{a.consultant_notes}</p>
          </div>
        )});
      }
    });

    return b;
  }, [entries, agg, t, groupName, osdNames, dateStr]);

  // Pack measured blocks into A4 pages; repeat the PPE table header on every page with rows.
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const avail = PAGE_H - PAD_TOP - PAD_BOTTOM;
    const q = (k: string) => (root.querySelector(`[data-m="${k}"]`) as HTMLElement | null)?.offsetHeight || 0;
    const pageHeadH = q('pagehead') || HEADER_H_GUESS;
    const tblHeadH = q('tblhead');
    const out: Block[][] = [];
    let page: Block[] | null = null;
    let used = 0;
    const newPage = () => { page = []; out.push(page); used = pageHeadH; };
    blocks.forEach((bl, i) => {
      const h = q(bl.key);
      const sectionChanged = !page || (bl.section === 'details' && page[page.length - 1]?.section === 'table');
      if (sectionChanged) newPage();
      const p = page as Block[];
      const needHead = bl.kind === 'row' && (p.length === 0 || p[p.length - 1].kind !== 'row');
      if (used + h + (needHead ? tblHeadH : 0) > avail && p.length) newPage();
      const p2 = page as Block[];
      if (bl.kind === 'row' && (p2.length === 0 || p2[p2.length - 1].kind !== 'row')) {
        p2.push({ key: `thead-${i}`, section: bl.section, kind: 'block', node: <PpeTableHead /> });
        used += tblHeadH;
      }
      p2.push(bl);
      used += h;
    });
    setPages(out);
  }, [blocks]);

  useLayoutEffect(() => { if (pages) onPaginated?.(); }, [pages, onPaginated]);

  const periodLabel = t.samePeriod && t.periodFrom && t.periodTo ? `${fmtDate(t.periodFrom)} – ${fmtDate(t.periodTo)}` : 'różne okresy';
  const maxBar = Math.max(t.totalBefore, t.totalAfter);

  return (
    <div style={{ width: PAGE_W, background: '#fff' }}>
      {/* hidden measuring area — same content width and fonts as a page */}
      <div ref={measureRef} aria-hidden style={{ position: 'absolute', left: -10000, top: 0, width: CONTENT_W, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div data-m="pagehead"><PageHeader title="X" icon={iconChart} /></div>
        <div data-m="tblhead"><PpeTableHead /></div>
        {blocks.map((bl) => <div key={bl.key} data-m={bl.key}>{bl.node}</div>)}
      </div>

      {/* ═══════════ COVER ═══════════ */}
      <div style={{ ...pageBase, ...pageBreak, padding: 0 }} className="print-avoid-break">
        <img src={coverPattern} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 36, left: 40, zIndex: 2 }}><img src={logo} alt="Optienergia" style={{ height: 44 }} /></div>
        <div style={{ position: 'absolute', top: 40, right: 40, zIndex: 2, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 16px', color: '#fff', fontSize: 12, fontWeight: 500 }}>{dateStr}</div>
        <div style={{ position: 'absolute', top: 200, left: 40, right: 40, zIndex: 2 }}>
          <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.6)', borderRadius: 2, marginBottom: 20 }} />
          <h1 style={{ fontFamily: H_FONT, fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.2, margin: '0 0 12px' }}>Raport z analizy<br />kosztów energii</h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', margin: 0, fontWeight: 500, wordBreak: 'break-word' }}>{groupName}</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '4px 0 0' }}>Zbiorcze porównanie {entries.length} punktów poboru energii (PPE)</p>
        </div>
        <div style={{ position: 'absolute', top: 440, left: 40, width: 340, zIndex: 2, background: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: 28 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Dane klienta</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px', wordBreak: 'break-word' }}>{project.client_name}</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>NIP: {project.client_nip}</p>
          {project.client_address && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{project.client_address}</p>}
        </div>
        <div style={{ position: 'absolute', top: 440, right: 40, width: 340, zIndex: 2, background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 28 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Informacje o analizie</p>
          <InfoRow label="Okres" value={periodLabel} />
          <InfoRow label="Liczba PPE" value={String(entries.length)} />
          {agg && <InfoRow label="Łączny koszt PRZED" value={formatCurrency(t.totalBefore)} />}
          {agg && <InfoRow label="Łączny koszt PO" value={formatCurrency(t.totalAfter)} />}
          {agg && <InfoRow label="Oszczędność" value={`${formatCurrency(Math.abs(t.savingsValue))} (${t.savingsPercent === null ? 'nie dotyczy' : formatPercent(Math.abs(t.savingsPercent))})`} />}
        </div>
        <div style={{ position: 'absolute', bottom: 90, left: 40, right: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Przygotował</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '2px 0 0' }}>{preparerName}</p>
            {preparerEmail && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{preparerEmail}</p>}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>www.optienergia.pl</p>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 40px 16px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10 }}>
            <p style={{ fontSize: 7.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: 0, letterSpacing: 0.1 }}>{RODO_TEXT}</p>
          </div>
        </div>
      </div>

      {/* ═══════════ AGGREGATE COST COMPARISON ═══════════ */}
      {agg && (
        <div style={{ ...pageBase, ...pageBreak, padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px` }} className="print-avoid-break">
          <PageHeader title="Porównanie kosztów" icon={iconChart} />
          <p style={{ fontSize: 12, color: '#777', marginBottom: 18, lineHeight: 1.5 }}>
            Suma składników kosztów energii wszystkich {entries.length} punktów poboru w wariantach PRZED i PO za okres analizy.
          </p>
          <CostTable rows={aggRows} totalBefore={t.totalBefore} totalAfter={t.totalAfter} />
          {someRowsOmitted && (
            <p style={{ fontSize: 10.5, color: '#888', margin: '8px 0 0' }}>Składniki pominięte w części punktów nie są pokazywane osobno; kwota RAZEM obejmuje wszystkie uwzględnione składniki.</p>
          )}
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 16, letterSpacing: 0.2 }}>Wizualne porównanie kosztów</p>
            <CostBar label="PRZED" value={t.totalBefore} max={maxBar} color="#8b9db5" gradientTo="#6b7f99" />
            <CostBar label="PO" value={t.totalAfter} max={maxBar} color="#0d6b42" gradientTo="#1a8a5a" />
          </div>
          <div style={{ marginTop: 28, background: 'linear-gradient(135deg, #e8f5f0, #dff0ea)', borderRadius: 14, padding: '22px 28px', display: 'flex', alignItems: 'center', gap: 20, border: '1px solid #c8e6d8' }}>
            <img src={iconSavings} alt="" style={{ width: 38, height: 38, opacity: 0.7 }} />
            <div>
              <p style={{ fontSize: 12, color: '#666', margin: 0, fontWeight: 500 }}>Szacowana łączna oszczędność za okres analizy</p>
              <p style={{ fontSize: 30, fontWeight: 800, color: t.savingsValue > 0 ? '#0d6b42' : RED, margin: '4px 0 0', fontFamily: H_FONT }}>{formatCurrency(Math.abs(t.savingsValue))}</p>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <p style={{ fontSize: 12, color: '#666', margin: 0, fontWeight: 500 }}>Procentowo</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: t.savingsValue > 0 ? '#0d6b42' : RED, margin: '4px 0 0', fontFamily: H_FONT }}>{t.savingsPercent === null ? 'nie dotyczy' : formatPercent(Math.abs(t.savingsPercent))}</p>
            </div>
          </div>
          {/* Savings per PPE — same bar style */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <img src={iconEnergy} alt="" style={{ width: 18, height: 18, opacity: 0.6 }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: DARK, margin: 0 }}>Udział punktów w kosztach PRZED</p>
            </div>
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden' }}>
              {entries.map((e, i) => {
                const pct = t.totalBefore > 0 ? (e.result.totalCostBefore / t.totalBefore) * 100 : 0;
                const shades = ['#0d6b42', '#2ea87a', '#7dd3b3', '#1a6b5a', '#4fbf94'];
                return pct > 0 ? <div key={e.analysis.id} style={{ width: `${pct}%`, background: shades[i % shades.length], color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pct >= 8 ? `${i + 1}` : ''}</div> : null;
              })}
            </div>
            <p style={{ fontSize: 10.5, color: '#888', margin: '6px 0 0' }}>Numery odpowiadają pozycjom w zestawieniu punktów.</p>
          </div>
          <div style={{ position: 'absolute', left: 40, right: 40, bottom: 68 }}>
      <div style={{ borderTop: `2px solid ${DARK}`, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Optienergia" style={{ height: 28 }} />
          <span style={{ fontSize: 12, color: '#777' }}>• {dateStr}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: '#999', margin: 0 }}>Niniejszy dokument ma charakter informacyjny i nie stanowi oferty handlowej.</p>
          <p style={{ fontSize: 11, margin: '2px 0 0', color: '#1a6b5a' }}>www.optienergia.pl</p>
        </div>
      </div>
    </div>
          <RodoFooter />
        </div>
      )}

      {/* ═══════════ FLOW PAGES (table, details, closing) ═══════════ */}
      {pages?.map((p, pi) => {
        const s = SECTION_TITLES[p[0]?.section || 'details'];
        const cont = pi > 0 && pages[pi - 1][0]?.section === p[0]?.section;
        return (
          <div key={pi} style={{ ...pageBase, ...(pi < pages.length - 1 ? pageBreak : {}), padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px` }} className="print-avoid-break">
            <PageHeader title={cont ? `${s.title} (cd.)` : s.title} icon={s.icon} />
            {p.map((bl) => <div key={bl.key}>{bl.node}</div>)}
            <RodoFooter />
          </div>
        );
      })}
    </div>
  );
}
