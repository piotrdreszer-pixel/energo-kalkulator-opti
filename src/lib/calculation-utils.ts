import type { EnergyAnalysis } from '@/types/database';
import { calculatePeriodMonths } from './tariff-utils';

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
  // Additional breakdowns for display
  contractedPowerChargeBefore: number;
  contractedPowerChargeAfter: number;
  reactiveEnergyCostBefore: number;
  reactiveEnergyCostAfter: number;
  periodMonths: number;
}

export function calculateEnergyCosts(analysis: Partial<EnergyAnalysis>): CalculationResult {
  const zonesCountBefore = analysis.zones_count_before || 1;
  const zonesCountAfter = analysis.zones_count_after || 1;
  
  // Calculate period length in months
  const periodMonths = calculatePeriodMonths(
    analysis.period_from || null, 
    analysis.period_to || null
  );

  // Contracted power charge - monthly rate scaled to period
  const contractedPowerBefore = Number(analysis.contracted_power_before_kw) || 0;
  const contractedPowerAfter = Number(analysis.contracted_power_after_kw) || 0;
  const monthlyRateBefore = Number(analysis.contracted_power_charge_rate_before) || 0;
  const monthlyRateAfter = Number(analysis.contracted_power_charge_rate_after) || 0;
  
  const contractedPowerChargeBefore = contractedPowerBefore * monthlyRateBefore * periodMonths;
  const contractedPowerChargeAfter = contractedPowerAfter * monthlyRateAfter * periodMonths;

  // Reactive energy cost - depends on input mode
  let reactiveEnergyCostBefore: number;
  let reactiveEnergyCostAfter: number;
  
  if (analysis.reactive_monthly_mode_before) {
    // Sum of 12 monthly values
    reactiveEnergyCostBefore = [
      analysis.reactive_energy_before_month_1,
      analysis.reactive_energy_before_month_2,
      analysis.reactive_energy_before_month_3,
      analysis.reactive_energy_before_month_4,
      analysis.reactive_energy_before_month_5,
      analysis.reactive_energy_before_month_6,
      analysis.reactive_energy_before_month_7,
      analysis.reactive_energy_before_month_8,
      analysis.reactive_energy_before_month_9,
      analysis.reactive_energy_before_month_10,
      analysis.reactive_energy_before_month_11,
      analysis.reactive_energy_before_month_12,
    ].reduce((sum, val) => sum + (Number(val) || 0), 0);
  } else {
    reactiveEnergyCostBefore = Number(analysis.reactive_energy_cost_before) || 0;
  }
  
  if (analysis.reactive_monthly_mode_after) {
    // Sum of 12 monthly values
    reactiveEnergyCostAfter = [
      analysis.reactive_energy_after_month_1,
      analysis.reactive_energy_after_month_2,
      analysis.reactive_energy_after_month_3,
      analysis.reactive_energy_after_month_4,
      analysis.reactive_energy_after_month_5,
      analysis.reactive_energy_after_month_6,
      analysis.reactive_energy_after_month_7,
      analysis.reactive_energy_after_month_8,
      analysis.reactive_energy_after_month_9,
      analysis.reactive_energy_after_month_10,
      analysis.reactive_energy_after_month_11,
      analysis.reactive_energy_after_month_12,
    ].reduce((sum, val) => sum + (Number(val) || 0), 0);
  } else {
    reactiveEnergyCostAfter = Number(analysis.reactive_energy_cost_after) || 0;
  }

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
  const capacityBefore = Number(analysis.capacity_charge_before) || 0;

  const distributionCostBefore = fixedDistBefore + varDistBefore1 + varDistBefore2 + varDistBefore3 + 
                                  reactiveEnergyCostBefore + capacityBefore + contractedPowerChargeBefore;

  // Distribution AFTER - uses consumption_after_zone*_mwh for mapped consumption
  const fixedDistAfter = Number(analysis.fixed_distribution_after_total) || 0;
  // Variable distribution rates are in PLN/kWh, consumption is in MWh, so multiply by 1000
  const varDistAfter1 = (Number(analysis.variable_distribution_after_zone1_rate) || 0) * 
                         (Number(analysis.consumption_after_zone1_mwh) || 0) * 1000;
  const varDistAfter2 = zonesCountAfter >= 2 
    ? (Number(analysis.variable_distribution_after_zone2_rate) || 0) * 
      (Number(analysis.consumption_after_zone2_mwh) || 0) * 1000 
    : 0;
  const varDistAfter3 = zonesCountAfter >= 3 
    ? (Number(analysis.variable_distribution_after_zone3_rate) || 0) * 
      (Number(analysis.consumption_after_zone3_mwh) || 0) * 1000 
    : 0;
  const capacityAfter = Number(analysis.capacity_charge_after) || 0;

  const distributionCostAfter = fixedDistAfter + varDistAfter1 + varDistAfter2 + varDistAfter3 + 
                                 reactiveEnergyCostAfter + capacityAfter + contractedPowerChargeAfter;

  // Active energy BEFORE - rates are in PLN/kWh, consumption in MWh, multiply by 1000
  const activeEnergy1Before = (Number(analysis.active_energy_price_before_zone1) || 0) * 
                               (Number(analysis.consumption_zone1_mwh) || 0) * 1000;
  const activeEnergy2Before = zonesCountBefore >= 2 
    ? (Number(analysis.active_energy_price_before_zone2) || 0) * 
      (Number(analysis.consumption_zone2_mwh) || 0) * 1000
    : 0;
  const activeEnergy3Before = zonesCountBefore >= 3 
    ? (Number(analysis.active_energy_price_before_zone3) || 0) * 
      (Number(analysis.consumption_zone3_mwh) || 0) * 1000
    : 0;

  const activeEnergyCostBefore = activeEnergy1Before + activeEnergy2Before + activeEnergy3Before;

  // Active energy AFTER - uses consumption_after_zone*_mwh for mapped consumption
  // Rates are in PLN/kWh, consumption in MWh, multiply by 1000
  const activeEnergy1After = (Number(analysis.active_energy_price_after_zone1) || 0) * 
                              (Number(analysis.consumption_after_zone1_mwh) || 0) * 1000;
  const activeEnergy2After = zonesCountAfter >= 2 
    ? (Number(analysis.active_energy_price_after_zone2) || 0) * 
      (Number(analysis.consumption_after_zone2_mwh) || 0) * 1000
    : 0;
  const activeEnergy3After = zonesCountAfter >= 3 
    ? (Number(analysis.active_energy_price_after_zone3) || 0) * 
      (Number(analysis.consumption_after_zone3_mwh) || 0) * 1000
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
    contractedPowerChargeBefore,
    contractedPowerChargeAfter,
    reactiveEnergyCostBefore,
    reactiveEnergyCostAfter,
    periodMonths,
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
