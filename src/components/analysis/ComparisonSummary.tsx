import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/calculation-utils';

interface ComparisonSummaryProps {
  costBefore: number;
  costAfter: number;
  periodMonths: number;
  consultantNotes: string;
  onNotesChange: (notes: string) => void;
  breakdown: {
    distributionBefore: number;
    distributionAfter: number;
    activeEnergyBefore: number;
    activeEnergyAfter: number;
    contractedPowerBefore: number;
    contractedPowerAfter: number;
    reactiveBefore: number;
    reactiveAfter: number;
    handlingBefore: number;
    handlingAfter: number;
    capacityBefore: number;
    capacityAfter: number;
    fixedDistributionBefore: number;
    fixedDistributionAfter: number;
  };
}

export function ComparisonSummary({
  costBefore,
  costAfter,
  periodMonths,
  consultantNotes,
  onNotesChange,
  breakdown,
}: ComparisonSummaryProps) {
  const delta = costAfter - costBefore;
  const savingsValue = -delta; // Positive means savings
  const savingsPercent = costBefore !== 0 ? (savingsValue / costBefore) * 100 : 0;

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingDown className="h-5 w-5 text-green-600" />;
    if (value < 0) return <TrendingUp className="h-5 w-5 text-red-600" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  const getSavingsColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const renderDeltaRow = (label: string, before: number, after: number) => {
    const diff = before - after;
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground w-24 text-right">{formatCurrency(before)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="w-24 text-right">{formatCurrency(after)}</span>
          <span className={`w-24 text-right font-medium ${getSavingsColor(diff)}`}>
            {formatCurrency(Math.abs(diff))}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Main summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Koszt PRZED</p>
            <p className="text-2xl font-bold">{formatCurrency(costBefore)}</p>
            <p className="text-xs text-muted-foreground">za {periodMonths} mies.</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Koszt PO</p>
            <p className="text-2xl font-bold">{formatCurrency(costAfter)}</p>
            <p className="text-xs text-muted-foreground">za {periodMonths} mies.</p>
          </CardContent>
        </Card>
        
        <Card className={savingsValue > 0 ? 'border-green-500/30 bg-green-500/5' : savingsValue < 0 ? 'border-red-500/30 bg-red-500/5' : ''}>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Różnica</p>
            <div className="flex items-center justify-center gap-2">
              {getTrendIcon(savingsValue)}
              <p className={`text-2xl font-bold ${getSavingsColor(savingsValue)}`}>
                {formatCurrency(Math.abs(savingsValue))}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {savingsValue > 0 ? 'oszczędność' : savingsValue < 0 ? 'wzrost kosztu' : 'bez zmian'}
            </p>
          </CardContent>
        </Card>
        
        <Card className={savingsValue > 0 ? 'border-green-500/30 bg-green-500/5' : savingsValue < 0 ? 'border-red-500/30 bg-red-500/5' : ''}>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Zmiana</p>
            <p className={`text-2xl font-bold ${getSavingsColor(savingsValue)}`}>
              {formatPercent(Math.abs(savingsPercent))}
            </p>
            <p className="text-xs text-muted-foreground">procentowo</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Szczegółowe zestawienie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <div className="flex items-center justify-between py-2 font-medium text-sm">
              <span>Składnik</span>
              <div className="flex items-center gap-4">
                <span className="w-24 text-right text-muted-foreground">PRZED</span>
                <span className="w-4"></span>
                <span className="w-24 text-right text-muted-foreground">PO</span>
                <span className="w-24 text-right">Δ</span>
              </div>
            </div>
            {renderDeltaRow('Składnik zmienny stawki sieciowej', breakdown.distributionBefore, breakdown.distributionAfter)}
            {renderDeltaRow('Opłata za moc umowną', breakdown.contractedPowerBefore, breakdown.contractedPowerAfter)}
            {renderDeltaRow('Opłata mocowa', breakdown.capacityBefore, breakdown.capacityAfter)}
            {renderDeltaRow('Energia bierna', breakdown.reactiveBefore, breakdown.reactiveAfter)}
            {renderDeltaRow('Opłata handlowa', breakdown.handlingBefore, breakdown.handlingAfter)}
            {renderDeltaRow('Suma pozostałych opłat', breakdown.fixedDistributionBefore, breakdown.fixedDistributionAfter)}
            {renderDeltaRow('Energia czynna', breakdown.activeEnergyBefore, breakdown.activeEnergyAfter)}
          </div>
          
          <div className="flex items-center justify-between py-3 mt-2 border-t-2 font-bold">
            <span>RAZEM</span>
            <div className="flex items-center gap-4">
              <span className="w-24 text-right">{formatCurrency(costBefore)}</span>
              <span className="w-4"></span>
              <span className="w-24 text-right">{formatCurrency(costAfter)}</span>
              <span className={`w-24 text-right ${getSavingsColor(savingsValue)}`}>
                {formatCurrency(Math.abs(savingsValue))}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consultant notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Uzasadnienie rekomendacji</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={consultantNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Wprowadź uzasadnienie wyboru rekomendowanej taryfy, uwagi dla klienta..."
            className="min-h-[120px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}