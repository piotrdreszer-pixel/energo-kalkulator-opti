CREATE OR REPLACE FUNCTION public.ai_allowed_fields(_kind text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _kind
    WHEN 'po' THEN public.ai_allowed_po_fields()
    WHEN 'period' THEN ARRAY['period_from','period_to']
    WHEN 'estimate' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'estimate_replace' THEN ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'year_simulation' THEN ARRAY['period_from','period_to','consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','capacity_charge_before','reactive_energy_cost_before','contracted_power_before_kw']
    WHEN 'tariff_po' THEN public.ai_allowed_po_fields() || ARRAY['tariff_code_after','zones_count_after','season_after','rate_card_id_after','rates_year_after','rates_source_after','rates_overridden_after',
      'fixed_distribution_after_total','contracted_power_charge_rate_after','variable_distribution_after_zone1_rate','variable_distribution_after_zone2_rate','variable_distribution_after_zone3_rate',
      'consumption_after_zone1_mwh','consumption_after_zone2_mwh','consumption_after_zone3_mwh']
    WHEN 'tariff_przed' THEN ARRAY['tariff_code_before','zones_count_before','season_before','rate_card_id_before','rates_year_before','rates_source_before','rates_overridden_before','contracted_power_before_kw',
      'fixed_distribution_before_total','contracted_power_charge_rate_before','variable_distribution_before_zone1_rate','variable_distribution_before_zone2_rate','variable_distribution_before_zone3_rate',
      'active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh']
    WHEN 'field_przed' THEN ARRAY['contracted_power_before_kw','active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','handling_fee_before','capacity_charge_before','reactive_energy_cost_before']
    WHEN 'report_selection' THEN ARRAY['include_in_project_report']
    ELSE ARRAY[]::text[] END
$function$;