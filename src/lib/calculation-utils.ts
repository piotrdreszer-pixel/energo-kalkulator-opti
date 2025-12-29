import type { EnergyAnalysis } from '@/types/database';

export interface CalculationResult {
  distributionCostBefore: number;
  distributionCostAfter: number;
  activeEnergyCostBefore: number;
  activeEnergyCostAfter: number;
  handlingFeeBefore: number;
  handlingFeeAfter: number;
  totalCostBefore: number;
  totalCostAfter: number;
  savingsValue: number;
  savingsPercent: number;
}

export function calculateEnergyCosts(analysis: Partial<EnergyAnalysis>): CalculationResult {
  const zonesCountBefore = analysis.zones_count_before || 1;
  const zonesCountAfter = analysis.zones_count_after || 1;

  // Distribution BEFORE
  const fixedDistBefore = Number(analysis.fixed_distribution_before_total) || 0;
  const varDistBefore1 = (Number(analysis.variable_distribution_before_zone1_rate) || 0) * 
                          (Number(analysis.consumption_zone1_mwh) || 0) * 1000;
  const varDistBefore2 = zonesCountBefore >= 2 
    ? (Number(analysis.variable_distribution_before_zone2_rate) || 0) * 
      (Number(analysis.consumption_zone2_mwh) || 0) * 1000 
    : 0;
  const varDistBefore3 = zonesCountBefore >= 3 
    ? (Number(analysis.variable_distribution_before_zone3_rate) || 0) * 
      (Number(analysis.consumption_zone3_mwh) || 0) * 1000 
    : 0;
  const reactiveBefore = Number(analysis.reactive_energy_cost_before) || 0;
  const capacityBefore = Number(analysis.capacity_charge_before) || 0;
  const contractedPowerChargeBefore = (Number(analysis.contracted_power_before_kw) || 0) * 
                                       (Number(analysis.contracted_power_charge_rate_before) || 0);

  const distributionCostBefore = fixedDistBefore + varDistBefore1 + varDistBefore2 + varDistBefore3 + 
                                  reactiveBefore + capacityBefore + contractedPowerChargeBefore;

  // Distribution AFTER
  const fixedDistAfter = Number(analysis.fixed_distribution_after_total) || 0;
  const varDistAfter1 = (Number(analysis.variable_distribution_after_zone1_rate) || 0) * 
                         (Number(analysis.consumption_zone1_mwh) || 0) * 1000;
  const varDistAfter2 = zonesCountAfter >= 2 
    ? (Number(analysis.variable_distribution_after_zone2_rate) || 0) * 
      (Number(analysis.consumption_zone2_mwh) || 0) * 1000 
    : 0;
  const varDistAfter3 = zonesCountAfter >= 3 
    ? (Number(analysis.variable_distribution_after_zone3_rate) || 0) * 
      (Number(analysis.consumption_zone3_mwh) || 0) * 1000 
    : 0;
  const reactiveAfter = Number(analysis.reactive_energy_cost_after) || 0;
  const capacityAfter = Number(analysis.capacity_charge_after) || 0;
  const contractedPowerChargeAfter = (Number(analysis.contracted_power_after_kw) || 0) * 
                                      (Number(analysis.contracted_power_charge_rate_after) || 0);

  const distributionCostAfter = fixedDistAfter + varDistAfter1 + varDistAfter2 + varDistAfter3 + 
                                 reactiveAfter + capacityAfter + contractedPowerChargeAfter;

  // Active energy BEFORE
  const activeEnergy1Before = (Number(analysis.active_energy_price_before_zone1) || 0) * 
                               (Number(analysis.consumption_zone1_mwh) || 0);
  const activeEnergy2Before = zonesCountBefore >= 2 
    ? (Number(analysis.active_energy_price_before_zone2) || 0) * 
      (Number(analysis.consumption_zone2_mwh) || 0) 
    : 0;
  const activeEnergy3Before = zonesCountBefore >= 3 
    ? (Number(analysis.active_energy_price_before_zone3) || 0) * 
      (Number(analysis.consumption_zone3_mwh) || 0) 
    : 0;

  const activeEnergyCostBefore = activeEnergy1Before + activeEnergy2Before + activeEnergy3Before;

  // Active energy AFTER
  const activeEnergy1After = (Number(analysis.active_energy_price_after_zone1) || 0) * 
                              (Number(analysis.consumption_zone1_mwh) || 0);
  const activeEnergy2After = zonesCountAfter >= 2 
    ? (Number(analysis.active_energy_price_after_zone2) || 0) * 
      (Number(analysis.consumption_zone2_mwh) || 0) 
    : 0;
  const activeEnergy3After = zonesCountAfter >= 3 
    ? (Number(analysis.active_energy_price_after_zone3) || 0) * 
      (Number(analysis.consumption_zone3_mwh) || 0) 
    : 0;

  const activeEnergyCostAfter = activeEnergy1After + activeEnergy2After + activeEnergy3After;

  // Handling fees
  const handlingFeeBefore = Number(analysis.handling_fee_before) || 0;
  const handlingFeeAfter = Number(analysis.handling_fee_after) || 0;

  // Totals
  const totalCostBefore = distributionCostBefore + activeEnergyCostBefore + handlingFeeBefore;
  const totalCostAfter = distributionCostAfter + activeEnergyCostAfter + handlingFeeAfter;

  // Savings
  const savingsValue = totalCostBefore - totalCostAfter;
  const savingsPercent = totalCostBefore > 0 ? (savingsValue / totalCostBefore) * 100 : 0;

  return {
    distributionCostBefore,
    distributionCostAfter,
    activeEnergyCostBefore,
    activeEnergyCostAfter,
    handlingFeeBefore,
    handlingFeeAfter,
    totalCostBefore,
    totalCostAfter,
    savingsValue,
    savingsPercent,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
