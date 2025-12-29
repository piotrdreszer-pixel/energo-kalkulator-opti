export type ProjectStatus = 'roboczy' | 'wysłany klientowi' | 'zaakceptowany';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  email_verified: boolean;
  verification_token: string | null;
  verification_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientProject {
  id: string;
  client_name: string;
  client_nip: string;
  client_address: string | null;
  description: string | null;
  created_by_user_id: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator_name?: string;
}

export interface EnergyAnalysis {
  id: string;
  client_project_id: string;
  name: string;
  period_from: string | null;
  period_to: string | null;
  
  // Tariff
  tariff_code_before: string;
  tariff_code_after: string;
  zones_count_before: number;
  zones_count_after: number;
  
  // Contracted power
  contracted_power_before_kw: number;
  contracted_power_after_kw: number;
  
  // Distribution BEFORE
  fixed_distribution_before_total: number;
  variable_distribution_before_zone1_rate: number;
  variable_distribution_before_zone2_rate: number;
  variable_distribution_before_zone3_rate: number;
  reactive_energy_cost_before: number;
  capacity_charge_before: number;
  contracted_power_charge_rate_before: number; // Monthly rate [zł/kW/miesiąc]
  
  // Reactive energy monthly mode BEFORE
  reactive_monthly_mode_before: boolean;
  reactive_energy_before_month_1: number;
  reactive_energy_before_month_2: number;
  reactive_energy_before_month_3: number;
  reactive_energy_before_month_4: number;
  reactive_energy_before_month_5: number;
  reactive_energy_before_month_6: number;
  reactive_energy_before_month_7: number;
  reactive_energy_before_month_8: number;
  reactive_energy_before_month_9: number;
  reactive_energy_before_month_10: number;
  reactive_energy_before_month_11: number;
  reactive_energy_before_month_12: number;
  
  // Distribution AFTER
  fixed_distribution_after_total: number;
  variable_distribution_after_zone1_rate: number;
  variable_distribution_after_zone2_rate: number;
  variable_distribution_after_zone3_rate: number;
  reactive_energy_cost_after: number;
  capacity_charge_after: number;
  contracted_power_charge_rate_after: number; // Monthly rate [zł/kW/miesiąc]
  
  // Reactive energy monthly mode AFTER
  reactive_monthly_mode_after: boolean;
  reactive_energy_after_month_1: number;
  reactive_energy_after_month_2: number;
  reactive_energy_after_month_3: number;
  reactive_energy_after_month_4: number;
  reactive_energy_after_month_5: number;
  reactive_energy_after_month_6: number;
  reactive_energy_after_month_7: number;
  reactive_energy_after_month_8: number;
  reactive_energy_after_month_9: number;
  reactive_energy_after_month_10: number;
  reactive_energy_after_month_11: number;
  reactive_energy_after_month_12: number;
  
  // Active energy BEFORE
  active_energy_price_before_zone1: number;
  active_energy_price_before_zone2: number;
  active_energy_price_before_zone3: number;
  
  // Consumption
  consumption_zone1_mwh: number;
  consumption_zone2_mwh: number;
  consumption_zone3_mwh: number;
  
  // Active energy AFTER
  active_energy_price_after_zone1: number;
  active_energy_price_after_zone2: number;
  active_energy_price_after_zone3: number;
  
  // Handling fee
  handling_fee_before: number;
  handling_fee_after: number;
  
  created_at: string;
  updated_at: string;
}

export interface EnergyAnalysisFormData extends Omit<EnergyAnalysis, 'id' | 'client_project_id' | 'created_at' | 'updated_at'> {}
