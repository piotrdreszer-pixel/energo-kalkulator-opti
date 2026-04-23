import React from 'react';
import type { EnergyAnalysis, ClientProject } from '@/types/database';
import { CalculationResult, formatCurrency, formatPercent, formatNumber } from '@/lib/calculation-utils';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import logo from '@/assets/logo.png';
import coverPattern from '@/assets/pdf/cover-pattern.svg';
import iconEnergy from '@/assets/pdf/icon-energy.svg';
import iconChart from '@/assets/pdf/icon-chart.svg';
import iconPower from '@/assets/pdf/icon-power.svg';
import iconSavings from '@/assets/pdf/icon-savings.svg';

/* ────────────────────────────────────────────
   Stałe wymiarowe – fixed A4 layout (mm→px @96dpi ≈ 3.78)
   210mm ≈ 794px, 297mm ≈ 1123px
   ──────────────────────────────────────────── */
const PAGE_W = 794;
const PAGE_H = 1123;
const RODO_TEXT =
  'Administratorem Pani/Pana danych osobowych jest Optienergia Sp. z o.o., ul. Chwaszczyńska 135C, 81-571 Gdynia Polska, KRS: 0001141761, NIP: 5862412424, nr REGON: 540335113. Może się Pani/Pan skontaktować z Administratorem danych, wysyłając wiadomość e-mail na adres biuro@optienergia.pl. Więcej informacji na www.optienergia.pl/rodo';

/* ── Shared helpers ── */
const pageBase: React.CSSProperties = {
  width: '210mm',
  height: '297mm',
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#ffffff',
};

const pageBreak: React.CSSProperties = {
  pageBreakAfter: 'always',
  breakAfter: 'page',
};

const RodoFooter = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '0 40px 16px',
    }}
  >
    <div style={{ borderTop: '1px solid #d5d9dd', paddingTop: 10 }}>
      <p
        style={{
          fontSize: 7.5,
          lineHeight: 1.5,
          color: '#888',
          textAlign: 'center',
          margin: 0,
          letterSpacing: 0.1,
        }}
      >
        {RODO_TEXT}
      </p>
    </div>
  </div>
);

/* ═══════════════════════════════════════════
   PROPS
   ═══════════════════════════════════════════ */
interface Props {
  analysis: EnergyAnalysis;
  project: ClientProject;
  results: CalculationResult;
  preparerName: string;
  preparerEmail?: string;
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function AnalysisPdfDocument({ analysis, project, results, preparerName, preparerEmail }: Props) {
  const zonesCountBefore = analysis.zones_count_before || 1;
  const zonesCountAfter = analysis.zones_count_after || 1;
  const dateStr = format(new Date(), 'd MMMM yyyy', { locale: pl });

  const costRows = [
    { label: 'Energia czynna', before: results.activeEnergyCostBefore, after: results.activeEnergyCostAfter },
    { label: 'Składnik zmienny stawki sieciowej', before: results.distributionCostBefore, after: results.distributionCostAfter },
    { label: `Opłata za moc umowną (${results.periodMonths} mies.)`, before: results.contractedPowerChargeBefore, after: results.contractedPowerChargeAfter },
    { label: 'Opłata mocowa', before: results.capacityChargeBefore, after: results.capacityChargeAfter },
    { label: 'Energia bierna', before: results.reactiveEnergyCostBefore, after: results.reactiveEnergyCostAfter },
    { label: 'Opłata handlowa', before: results.handlingFeeBefore, after: results.handlingFeeAfter },
    { label: 'Suma pozostałych opłat', before: Number(analysis.fixed_distribution_before_total), after: Number(analysis.fixed_distribution_after_total) },
  ];

  // Compute zone shares for "after" scenario (Page 3 bottom chart)
  const totalAfterMWh =
    Number(analysis.consumption_after_zone1_mwh || 0) +
    Number(analysis.consumption_after_zone2_mwh || 0) +
    Number(analysis.consumption_after_zone3_mwh || 0);

  const zoneSharesAfter = [
    { label: 'Strefa 1', value: Number(analysis.consumption_after_zone1_mwh || 0), color: '#0d6b42' },
    ...(zonesCountAfter >= 2 ? [{ label: 'Strefa 2', value: Number(analysis.consumption_after_zone2_mwh || 0), color: '#2ea87a' }] : []),
    ...(zonesCountAfter >= 3 ? [{ label: 'Strefa 3', value: Number(analysis.consumption_after_zone3_mwh || 0), color: '#7dd3b3' }] : []),
  ];

  return (
    <div style={{ width: PAGE_W, background: '#fff' }}>
      {/* ═══════════ PAGE 1 — COVER ═══════════ */}
      <div style={{ ...pageBase, ...pageBreak, padding: 0 }} className="print-avoid-break">
        {/* Full-bleed background */}
        <img
          src={coverPattern}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* Logo */}
        <div style={{ position: 'absolute', top: 36, left: 40, zIndex: 2 }}>
          <img src={logo} alt="Optienergia" style={{ height: 44 }} />
        </div>

        {/* Date badge */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 40,
            zIndex: 2,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '6px 16px',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {dateStr}
        </div>

        {/* Title block */}
        <div style={{ position: 'absolute', top: 220, left: 40, right: 40, zIndex: 2 }}>
          <div
            style={{
              width: 60,
              height: 4,
              background: 'rgba(255,255,255,0.6)',
              borderRadius: 2,
              marginBottom: 20,
            }}
          />
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              fontSize: 38,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.2,
              margin: 0,
              marginBottom: 12,
            }}
          >
            Raport z analizy
            <br />
            kosztów energii
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', margin: 0, fontWeight: 500 }}>
            {analysis.name}
          </p>
        </div>

        {/* Client info card (dark glass) */}
        <div
          style={{
            position: 'absolute',
            top: 480,
            left: 40,
            width: 340,
            zIndex: 2,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 16,
            padding: '28px 28px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Dane klienta
          </p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{project.client_name}</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>NIP: {project.client_nip}</p>
          {project.client_address && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{project.client_address}</p>
          )}
        </div>

        {/* Analysis info card */}
        <div
          style={{
            position: 'absolute',
            top: 480,
            right: 40,
            width: 340,
            zIndex: 2,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: '28px 28px',
          }}
        >
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Informacje o analizie
          </p>
          <InfoRow label="Okres" value={
            analysis.period_from && analysis.period_to
              ? `${format(new Date(analysis.period_from), 'd.MM.yyyy')} – ${format(new Date(analysis.period_to), 'd.MM.yyyy')}`
              : 'Nie określono'
          } />
          <InfoRow label="Taryfa PRZED" value={analysis.tariff_code_before} />
          <InfoRow label="Taryfa PO" value={analysis.tariff_code_after} />
          <InfoRow label="Liczba miesięcy" value={String(results.periodMonths)} />
        </div>

        {/* Decorative bottom stripe */}
        <div
          style={{
            position: 'absolute',
            bottom: 90,
            left: 40,
            right: 40,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Przygotował</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '2px 0 0' }}>{preparerName}</p>
            {preparerEmail && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{preparerEmail}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>www.optienergia.pl</p>
          </div>
        </div>

        {/* Cover RODO (light on dark) */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 40px 16px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10 }}>
            <p style={{ fontSize: 7.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: 0, letterSpacing: 0.1 }}>
              {RODO_TEXT}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ PAGE 2 — COSTS TABLE ═══════════ */}
      <div style={{ ...pageBase, ...pageBreak, padding: '40px 40px 60px' }} className="print-avoid-break">
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src={iconChart} alt="" style={{ width: 28, height: 28 }} />
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 22, fontWeight: 700, color: '#0d4a42', margin: 0 }}>
            Porównanie kosztów
          </h2>
          <div style={{ flex: 1 }} />
          <img src={logo} alt="" style={{ height: 24, opacity: 0.5 }} />
        </div>

        <p style={{ fontSize: 12, color: '#777', marginBottom: 18, lineHeight: 1.5 }}>
          Zestawienie składników kosztów energii w wariantach PRZED i PO zmianie taryfy za okres analizy ({results.periodMonths} mies.).
        </p>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0d4a42' }}>
              <th style={{ ...thStyle, textAlign: 'left', borderRadius: '8px 0 0 0' }}>Składnik kosztu</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>PRZED [zł]</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>PO [zł]</th>
              <th style={{ ...thStyle, textAlign: 'right', borderRadius: '0 8px 0 0' }}>Różnica [zł]</th>
            </tr>
          </thead>
          <tbody>
            {costRows.map((row, i) => {
              const diff = row.before - row.after;
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafb' : '#fff' }}>
                  <td style={tdStyle}>{row.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.before)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.after)}</td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: diff > 0 ? '#1a8a5a' : diff < 0 ? '#d32f2f' : '#333',
                    }}
                  >
                    {diff > 0 ? '−' : diff < 0 ? '+' : ''}{formatCurrency(Math.abs(diff))}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr style={{ background: '#e8f5f0', fontWeight: 700 }}>
              <td style={{ ...tdStyle, borderRadius: '0 0 0 8px' }}>RAZEM</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(results.totalCostBefore)}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(results.totalCostAfter)}</td>
              <td
                style={{
                  ...tdStyle,
                  textAlign: 'right',
                  borderRadius: '0 0 8px 0',
                  color: results.savingsValue > 0 ? '#1a8a5a' : results.savingsValue < 0 ? '#d32f2f' : '#333',
                }}
              >
                {results.savingsValue > 0 ? '−' : results.savingsValue < 0 ? '+' : ''}{formatCurrency(Math.abs(results.savingsValue))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Premium visual comparison bars */}
        <div style={{ marginTop: 32 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0d4a42', marginBottom: 16, letterSpacing: 0.2 }}>
            Wizualne porównanie kosztów
          </p>
          <CostBar label="PRZED" value={results.totalCostBefore} max={Math.max(results.totalCostBefore, results.totalCostAfter)} color="#8b9db5" gradientTo="#6b7f99" />
          <CostBar label="PO" value={results.totalCostAfter} max={Math.max(results.totalCostBefore, results.totalCostAfter)} color="#0d6b42" gradientTo="#1a8a5a" />
        </div>

        {/* Savings highlight */}
        <div
          style={{
            marginTop: 28,
            background: 'linear-gradient(135deg, #e8f5f0, #dff0ea)',
            borderRadius: 14,
            padding: '22px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            border: '1px solid #c8e6d8',
          }}
        >
          <img src={iconSavings} alt="" style={{ width: 38, height: 38, opacity: 0.7 }} />
          <div>
            <p style={{ fontSize: 12, color: '#666', margin: 0, fontWeight: 500 }}>Szacowana oszczędność za okres analizy</p>
            <p style={{ fontSize: 30, fontWeight: 800, color: results.savingsValue > 0 ? '#0d6b42' : '#d32f2f', margin: '4px 0 0', fontFamily: "'Plus Jakarta Sans'" }}>
              {formatCurrency(Math.abs(results.savingsValue))}
            </p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 12, color: '#666', margin: 0, fontWeight: 500 }}>Procentowo</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: results.savingsValue > 0 ? '#0d6b42' : '#d32f2f', margin: '4px 0 0', fontFamily: "'Plus Jakarta Sans'" }}>
              {formatPercent(results.savingsPercent)}
            </p>
          </div>
        </div>

        <RodoFooter />
      </div>

      {/* ═══════════ PAGE 3 — PARAMETERS ═══════════ */}
      <div style={{ ...pageBase, padding: '40px 40px 60px' }} className="print-avoid-break">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src={iconPower} alt="" style={{ width: 28, height: 28 }} />
          <h2 style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: 22, fontWeight: 700, color: '#0d4a42', margin: 0 }}>
            Parametry analizy
          </h2>
          <div style={{ flex: 1 }} />
          <img src={logo} alt="" style={{ height: 24, opacity: 0.5 }} />
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* Moc umowna */}
          <ParamCard icon={iconPower} title="Moc umowna">
            <ParamRow label="PRZED" value={`${formatNumber(Number(analysis.contracted_power_before_kw))} kW × ${formatNumber(Number(analysis.contracted_power_charge_rate_before))} zł/kW/mies.`} />
            <ParamRow label="PO" value={`${formatNumber(Number(analysis.contracted_power_after_kw))} kW × ${formatNumber(Number(analysis.contracted_power_charge_rate_after))} zł/kW/mies.`} />
          </ParamCard>

          {/* Zużycie PRZED */}
          <ParamCard icon={iconEnergy} title="Zużycie energii PRZED">
            <ParamRow label="Strefa 1" value={`${formatNumber(Number(analysis.consumption_before_zone1_mwh), 2)} MWh`} />
            {zonesCountBefore >= 2 && <ParamRow label="Strefa 2" value={`${formatNumber(Number(analysis.consumption_before_zone2_mwh), 2)} MWh`} />}
            {zonesCountBefore >= 3 && <ParamRow label="Strefa 3" value={`${formatNumber(Number(analysis.consumption_before_zone3_mwh), 2)} MWh`} />}
          </ParamCard>

          {/* Zużycie PO */}
          <ParamCard icon={iconEnergy} title="Zużycie energii PO">
            <ParamRow label="Strefa 1" value={`${formatNumber(Number(analysis.consumption_after_zone1_mwh), 2)} MWh`} />
            {zonesCountAfter >= 2 && <ParamRow label="Strefa 2" value={`${formatNumber(Number(analysis.consumption_after_zone2_mwh), 2)} MWh`} />}
            {zonesCountAfter >= 3 && <ParamRow label="Strefa 3" value={`${formatNumber(Number(analysis.consumption_after_zone3_mwh), 2)} MWh`} />}
          </ParamCard>

          {/* Stawki energii */}
          <ParamCard icon={iconChart} title="Stawki energii czynnej">
            <ParamRow label="PRZED S1" value={`${formatNumber(Number(analysis.active_energy_price_before_zone1))} zł/MWh`} />
            {zonesCountBefore >= 2 && <ParamRow label="PRZED S2" value={`${formatNumber(Number(analysis.active_energy_price_before_zone2))} zł/MWh`} />}
            <div style={{ height: 5 }} />
            <ParamRow label="PO S1" value={`${formatNumber(Number(analysis.active_energy_price_after_zone1))} zł/MWh`} />
            {zonesCountAfter >= 2 && <ParamRow label="PO S2" value={`${formatNumber(Number(analysis.active_energy_price_after_zone2))} zł/MWh`} />}
          </ParamCard>

          {/* Opłata mocowa */}
          <ParamCard icon={iconSavings} title="Opłaty dodatkowe">
            <ParamRow label="Opl. mocowa PRZED" value={formatCurrency(results.capacityChargeBefore)} />
            <ParamRow label="Opl. mocowa PO" value={formatCurrency(results.capacityChargeAfter)} />
            <div style={{ height: 5 }} />
            <ParamRow label="Opl. handlowa PRZED" value={`${formatNumber(Number(analysis.handling_fee_before))} zł/mies.`} />
            <ParamRow label="Opl. handlowa PO" value={`${formatNumber(Number(analysis.handling_fee_after))} zł/mies.`} />
          </ParamCard>

          {/* Energia bierna */}
          <ParamCard icon={iconEnergy} title="Energia bierna">
            <ParamRow label="PRZED" value={formatCurrency(results.reactiveEnergyCostBefore)} />
            <ParamRow label="PO" value={formatCurrency(results.reactiveEnergyCostAfter)} />
          </ParamCard>
        </div>

        {/* ── Bottom insight: Zone share chart (PO scenario) ── */}
        {totalAfterMWh > 0 && (
          <div
            style={{
              marginTop: 24,
              background: 'linear-gradient(135deg, #f0f7f4, #f8fafb)',
              borderRadius: 14,
              padding: '22px 28px',
              border: '1px solid #dce8e2',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <img src={iconChart} alt="" style={{ width: 18, height: 18, opacity: 0.6 }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0d4a42', margin: 0 }}>
                Struktura zużycia energii — scenariusz PO
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              {/* Horizontal stacked bar */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden' }}>
                  {zoneSharesAfter.map((z, i) => {
                    const pct = totalAfterMWh > 0 ? (z.value / totalAfterMWh) * 100 : 0;
                    return pct > 0 ? (
                      <div
                        key={i}
                        style={{
                          width: `${pct}%`,
                          background: z.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {pct >= 8 ? `${pct.toFixed(1)}%` : ''}
                      </div>
                    ) : null;
                  })}
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                  {zoneSharesAfter.map((z, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: z.color }} />
                      <span style={{ fontSize: 11, color: '#555' }}>
                        {z.label}: {formatNumber(z.value, 2)} MWh ({totalAfterMWh > 0 ? ((z.value / totalAfterMWh) * 100).toFixed(1) : '0'}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <RodoFooter />
      </div>

      {/* ═══════════ PAGE 4 — RESULTS TILES ═══════════ */}
      <div style={{ ...pageBase, padding: '40px 40px 60px' }} className="print-avoid-break">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src={iconSavings} alt="" style={{ width: 28, height: 28 }} />
          <h2 style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: 22, fontWeight: 700, color: '#0d4a42', margin: 0 }}>
            Podsumowanie
          </h2>
          <div style={{ flex: 1 }} />
          <img src={logo} alt="" style={{ height: 24, opacity: 0.5 }} />
        </div>

        {/* Hero tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          <ResultTile
            label="Koszt PRZED"
            value={formatCurrency(results.totalCostBefore)}
            subtitle="za okres analizy"
            bg="linear-gradient(135deg, #f1f5f9, #e2e8f0)"
            iconSrc={iconChart}
          />
          <ResultTile
            label="Koszt PO"
            value={formatCurrency(results.totalCostAfter)}
            subtitle="za okres analizy"
            bg="linear-gradient(135deg, #e8f5f0, #d1ede2)"
            iconSrc={iconChart}
          />
          <ResultTile
            label="Oszczędność netto"
            value={formatCurrency(Math.abs(results.savingsValue))}
            subtitle="za okres analizy"
            bg="linear-gradient(135deg, #0d6b42, #1a8a5a)"
            textColor="#fff"
            iconSrc={iconSavings}
            iconFilter="brightness(0) invert(1)"
          />
          <ResultTile
            label="Oszczędność procentowa"
            value={formatPercent(results.savingsPercent)}
            subtitle="względem kosztu PRZED"
            bg="linear-gradient(135deg, #0d4a42, #1a6b5a)"
            textColor="#fff"
            iconSrc={iconEnergy}
            iconFilter="brightness(0) invert(1)"
          />
        </div>

        {/* Consultant notes — premium advisory style */}
        {analysis.consultant_notes && (
          <div
            style={{
              background: 'linear-gradient(135deg, #f8fafb, #f0f4f3)',
              borderRadius: 16,
              padding: '28px 30px',
              border: '1px solid #d5ddd9',
              marginBottom: 24,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative left accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, #0d6b42, #1a8a5a)', borderRadius: '16px 0 0 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src={iconChart} alt="" style={{ width: 20, height: 20, opacity: 0.6 }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0d4a42', margin: 0, fontFamily: "'Plus Jakarta Sans'" }}>
                Rekomendacja doradcy energetycznego
              </p>
            </div>
            <p style={{ fontSize: 12.5, color: '#444', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', paddingLeft: 8 }}>
              {analysis.consultant_notes}
            </p>
          </div>
        )}

        {/* Final footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 68,
            left: 40,
            right: 40,
            borderTop: '2px solid #0d4a42',
            paddingTop: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logo} alt="Optienergia" style={{ height: 28 }} />
            <span style={{ fontSize: 12, color: '#777' }}>• {dateStr}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#999', margin: 0 }}>
              Niniejszy dokument ma charakter informacyjny i nie stanowi oferty handlowej.
            </p>
            <p style={{ fontSize: 11, margin: '2px 0 0' }}>
              <a href="https://www.optienergia.pl" style={{ color: '#1a6b5a', textDecoration: 'none' }}>www.optienergia.pl</a>
            </p>
          </div>
        </div>

        <RodoFooter />
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '2px 0 0' }}>{value}</p>
    </div>
  );
}

function ParamCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#f8fafb',
        borderRadius: 14,
        padding: '18px 20px',
        border: '1px solid #e8ecef',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <img src={icon} alt="" style={{ width: 20, height: 20, opacity: 0.7 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0d4a42', margin: 0 }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{value}</span>
    </div>
  );
}

function CostBar({ label, value, max, color, gradientTo }: { label: string; value: number; max: number; color: string; gradientTo: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#444', width: 60, letterSpacing: 0.3 }}>{label}</span>
      <div style={{ flex: 1, height: 32, background: '#f0f2f5', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${gradientTo})`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 12,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
            {formatCurrency(value)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultTile({
  label, value, subtitle, bg, textColor, iconSrc, iconFilter,
}: {
  label: string; value: string; subtitle: string; bg: string;
  textColor?: string; iconSrc: string; iconFilter?: string;
}) {
  const tc = textColor || '#333';
  return (
    <div
      style={{
        background: bg,
        borderRadius: 16,
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 130,
      }}
    >
      <img
        src={iconSrc}
        alt=""
        style={{ position: 'absolute', top: 20, right: 20, width: 32, height: 32, opacity: 0.2, filter: iconFilter }}
      />
      <p style={{ fontSize: 12, color: textColor ? 'rgba(255,255,255,0.7)' : '#777', margin: '0 0 8px', fontWeight: 500 }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 800, color: tc, margin: '0 0 6px', fontFamily: "'Plus Jakarta Sans'" }}>
        {value}
      </p>
      <p style={{ fontSize: 11, color: textColor ? 'rgba(255,255,255,0.55)' : '#999', margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}

/* ── Table cell styles ── */
const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #eef0f3',
  color: '#333',
  fontSize: 12,
};
