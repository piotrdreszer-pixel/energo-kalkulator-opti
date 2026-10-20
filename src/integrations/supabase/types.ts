export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_applied_changes: {
        Row: {
          analysis_group_id: string
          analysis_id: string
          assumption: string | null
          created_at: string
          fields: Json
          id: string
          proposal_id: string
          source: string
          undone_at: string | null
          undone_by: string | null
          user_id: string
        }
        Insert: {
          analysis_group_id: string
          analysis_id: string
          assumption?: string | null
          created_at?: string
          fields: Json
          id?: string
          proposal_id: string
          source: string
          undone_at?: string | null
          undone_by?: string | null
          user_id: string
        }
        Update: {
          analysis_group_id?: string
          analysis_id?: string
          assumption?: string | null
          created_at?: string
          fields?: Json
          id?: string
          proposal_id?: string
          source?: string
          undone_at?: string | null
          undone_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_applied_changes_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "analysis_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_applied_changes_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "energy_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_applied_changes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "ai_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          analysis_group_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          analysis_group_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          analysis_group_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "analysis_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          ppe_id: string | null
          ppe_label: string | null
          proposal_id: string | null
          role: string
          scope: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          ppe_id?: string | null
          ppe_label?: string | null
          proposal_id?: string | null
          role: string
          scope?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          ppe_id?: string | null
          ppe_label?: string | null
          proposal_id?: string | null
          role?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_proposals: {
        Row: {
          analysis_group_id: string
          analysis_id: string
          applied_change_id: string | null
          assumption: string | null
          base_updated_at: string
          before: Json
          changes: Json
          created_at: string
          id: string
          is_simulation: boolean
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_group_id: string
          analysis_id: string
          applied_change_id?: string | null
          assumption?: string | null
          base_updated_at: string
          before: Json
          changes: Json
          created_at?: string
          id?: string
          is_simulation?: boolean
          source: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_group_id?: string
          analysis_id?: string
          applied_change_id?: string | null
          assumption?: string | null
          base_updated_at?: string
          before?: Json
          changes?: Json
          created_at?: string
          id?: string
          is_simulation?: boolean
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposals_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "analysis_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_proposals_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "energy_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          analysis_group_id: string | null
          created_at: string
          id: string
          input_chars: number
          input_tokens: number | null
          model: string
          output_chars: number
          output_tokens: number | null
          status: string
          user_id: string
        }
        Insert: {
          analysis_group_id?: string | null
          created_at?: string
          id?: string
          input_chars?: number
          input_tokens?: number | null
          model: string
          output_chars?: number
          output_tokens?: number | null
          status: string
          user_id: string
        }
        Update: {
          analysis_group_id?: string | null
          created_at?: string
          id?: string
          input_chars?: number
          input_tokens?: number | null
          model?: string
          output_chars?: number
          output_tokens?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      analysis_documents: {
        Row: {
          analysis_group_id: string
          buyer_nip: string | null
          corrected_document_number: string | null
          created_at: string
          created_by: string | null
          doc_type: string | null
          document_number: string | null
          error: string | null
          extracted: Json | null
          file_hash: string | null
          file_name: string
          file_path: string
          id: string
          issuer: string | null
          mime_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          analysis_group_id: string
          buyer_nip?: string | null
          corrected_document_number?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          document_number?: string | null
          error?: string | null
          extracted?: Json | null
          file_hash?: string | null
          file_name: string
          file_path: string
          id?: string
          issuer?: string | null
          mime_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_group_id?: string
          buyer_nip?: string | null
          corrected_document_number?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          document_number?: string | null
          error?: string | null
          extracted?: Json | null
          file_hash?: string | null
          file_name?: string
          file_path?: string
          id?: string
          issuer?: string | null
          mime_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_documents_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "analysis_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_groups: {
        Row: {
          client_project_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          client_project_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          client_project_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_groups_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_projects: {
        Row: {
          client_address: string | null
          client_name: string
          client_nip: string
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client_address?: string | null
          client_name: string
          client_nip: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client_address?: string | null
          client_name?: string
          client_nip?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      document_line_items: {
        Row: {
          category: string | null
          created_at: string
          document_id: string
          gross_value: number | null
          id: string
          name: string
          net_value: number | null
          page: number | null
          ppe_record_id: string | null
          quantity: number | null
          rate: number | null
          unit: string | null
          vat_rate: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          document_id: string
          gross_value?: number | null
          id?: string
          name: string
          net_value?: number | null
          page?: number | null
          ppe_record_id?: string | null
          quantity?: number | null
          rate?: number | null
          unit?: string | null
          vat_rate?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          document_id?: string
          gross_value?: number | null
          id?: string
          name?: string
          net_value?: number | null
          page?: number | null
          ppe_record_id?: string | null
          quantity?: number | null
          rate?: number | null
          unit?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_line_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "analysis_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_line_items_ppe_record_id_fkey"
            columns: ["ppe_record_id"]
            isOneToOne: false
            referencedRelation: "document_ppe_records"
            referencedColumns: ["id"]
          },
        ]
      }
      document_ppe_records: {
        Row: {
          applied_at: string | null
          applied_fields: Json
          consumption: Json | null
          contracted_power_kw: number | null
          created_at: string
          document_id: string
          id: string
          match_status: string
          matched_analysis_id: string | null
          max_power_kw: number | null
          osd_name: string | null
          other_charges: Json | null
          period_from: string | null
          period_to: string | null
          power_exceedances: Json | null
          ppe_address: string | null
          ppe_number: string | null
          reactive: Json | null
          review_state: Json | null
          source_pages: Json | null
          tariff_code: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_fields?: Json
          consumption?: Json | null
          contracted_power_kw?: number | null
          created_at?: string
          document_id: string
          id?: string
          match_status?: string
          matched_analysis_id?: string | null
          max_power_kw?: number | null
          osd_name?: string | null
          other_charges?: Json | null
          period_from?: string | null
          period_to?: string | null
          power_exceedances?: Json | null
          ppe_address?: string | null
          ppe_number?: string | null
          reactive?: Json | null
          review_state?: Json | null
          source_pages?: Json | null
          tariff_code?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_fields?: Json
          consumption?: Json | null
          contracted_power_kw?: number | null
          created_at?: string
          document_id?: string
          id?: string
          match_status?: string
          matched_analysis_id?: string | null
          max_power_kw?: number | null
          osd_name?: string | null
          other_charges?: Json | null
          period_from?: string | null
          period_to?: string | null
          power_exceedances?: Json | null
          ppe_address?: string | null
          ppe_number?: string | null
          reactive?: Json | null
          review_state?: Json | null
          source_pages?: Json | null
          tariff_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_ppe_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "analysis_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_ppe_records_matched_analysis_id_fkey"
            columns: ["matched_analysis_id"]
            isOneToOne: false
            referencedRelation: "energy_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      energy_analyses: {
        Row: {
          active_energy_price_after_zone1: number | null
          active_energy_price_after_zone2: number | null
          active_energy_price_after_zone3: number | null
          active_energy_price_before_zone1: number | null
          active_energy_price_before_zone2: number | null
          active_energy_price_before_zone3: number | null
          analysis_group_id: string | null
          capacity_charge_after: number | null
          capacity_charge_before: number | null
          client_project_id: string
          consultant_notes: string | null
          consumption_after_zone1_mwh: number | null
          consumption_after_zone2_mwh: number | null
          consumption_after_zone3_mwh: number | null
          consumption_before_zone1_mwh: number | null
          consumption_before_zone2_mwh: number | null
          consumption_before_zone3_mwh: number | null
          consumption_zone1_mwh: number | null
          consumption_zone2_mwh: number | null
          consumption_zone3_mwh: number | null
          contracted_power_after_kw: number | null
          contracted_power_before_kw: number | null
          contracted_power_charge_rate_after: number | null
          contracted_power_charge_rate_before: number | null
          cost_mode_before: string
          created_at: string
          fixed_distribution_after_total: number | null
          fixed_distribution_before_total: number | null
          handling_fee_after: number | null
          handling_fee_before: number | null
          id: string
          include_in_project_report: boolean
          name: string
          osd_id: string | null
          period_from: string | null
          period_to: string | null
          ppe_address: string | null
          ppe_number: string | null
          rate_card_id_after: string | null
          rate_card_id_before: string | null
          rates_date: string | null
          rates_overridden_after: Json | null
          rates_overridden_before: Json | null
          rates_source_after: Json | null
          rates_source_before: Json | null
          rates_year_after: number | null
          rates_year_before: number | null
          reactive_energy_after_month_1: number | null
          reactive_energy_after_month_10: number | null
          reactive_energy_after_month_11: number | null
          reactive_energy_after_month_12: number | null
          reactive_energy_after_month_2: number | null
          reactive_energy_after_month_3: number | null
          reactive_energy_after_month_4: number | null
          reactive_energy_after_month_5: number | null
          reactive_energy_after_month_6: number | null
          reactive_energy_after_month_7: number | null
          reactive_energy_after_month_8: number | null
          reactive_energy_after_month_9: number | null
          reactive_energy_before_month_1: number | null
          reactive_energy_before_month_10: number | null
          reactive_energy_before_month_11: number | null
          reactive_energy_before_month_12: number | null
          reactive_energy_before_month_2: number | null
          reactive_energy_before_month_3: number | null
          reactive_energy_before_month_4: number | null
          reactive_energy_before_month_5: number | null
          reactive_energy_before_month_6: number | null
          reactive_energy_before_month_7: number | null
          reactive_energy_before_month_8: number | null
          reactive_energy_before_month_9: number | null
          reactive_energy_cost_after: number | null
          reactive_energy_cost_before: number | null
          reactive_monthly_mode_after: boolean
          reactive_monthly_mode_before: boolean
          report_excluded_components: string[]
          report_hidden_components: string[]
          season_after: string | null
          season_before: string | null
          shared_power_mode: boolean | null
          simulation_consumption_method: string | null
          simulation_period_from: string | null
          simulation_period_to: string | null
          tariff_code_after: string
          tariff_code_before: string
          updated_at: string
          value_sources: Json
          variable_distribution_after_zone1_rate: number | null
          variable_distribution_after_zone2_rate: number | null
          variable_distribution_after_zone3_rate: number | null
          variable_distribution_before_zone1_rate: number | null
          variable_distribution_before_zone2_rate: number | null
          variable_distribution_before_zone3_rate: number | null
          zones_count_after: number
          zones_count_before: number
        }
        Insert: {
          active_energy_price_after_zone1?: number | null
          active_energy_price_after_zone2?: number | null
          active_energy_price_after_zone3?: number | null
          active_energy_price_before_zone1?: number | null
          active_energy_price_before_zone2?: number | null
          active_energy_price_before_zone3?: number | null
          analysis_group_id?: string | null
          capacity_charge_after?: number | null
          capacity_charge_before?: number | null
          client_project_id: string
          consultant_notes?: string | null
          consumption_after_zone1_mwh?: number | null
          consumption_after_zone2_mwh?: number | null
          consumption_after_zone3_mwh?: number | null
          consumption_before_zone1_mwh?: number | null
          consumption_before_zone2_mwh?: number | null
          consumption_before_zone3_mwh?: number | null
          consumption_zone1_mwh?: number | null
          consumption_zone2_mwh?: number | null
          consumption_zone3_mwh?: number | null
          contracted_power_after_kw?: number | null
          contracted_power_before_kw?: number | null
          contracted_power_charge_rate_after?: number | null
          contracted_power_charge_rate_before?: number | null
          cost_mode_before?: string
          created_at?: string
          fixed_distribution_after_total?: number | null
          fixed_distribution_before_total?: number | null
          handling_fee_after?: number | null
          handling_fee_before?: number | null
          id?: string
          include_in_project_report?: boolean
          name?: string
          osd_id?: string | null
          period_from?: string | null
          period_to?: string | null
          ppe_address?: string | null
          ppe_number?: string | null
          rate_card_id_after?: string | null
          rate_card_id_before?: string | null
          rates_date?: string | null
          rates_overridden_after?: Json | null
          rates_overridden_before?: Json | null
          rates_source_after?: Json | null
          rates_source_before?: Json | null
          rates_year_after?: number | null
          rates_year_before?: number | null
          reactive_energy_after_month_1?: number | null
          reactive_energy_after_month_10?: number | null
          reactive_energy_after_month_11?: number | null
          reactive_energy_after_month_12?: number | null
          reactive_energy_after_month_2?: number | null
          reactive_energy_after_month_3?: number | null
          reactive_energy_after_month_4?: number | null
          reactive_energy_after_month_5?: number | null
          reactive_energy_after_month_6?: number | null
          reactive_energy_after_month_7?: number | null
          reactive_energy_after_month_8?: number | null
          reactive_energy_after_month_9?: number | null
          reactive_energy_before_month_1?: number | null
          reactive_energy_before_month_10?: number | null
          reactive_energy_before_month_11?: number | null
          reactive_energy_before_month_12?: number | null
          reactive_energy_before_month_2?: number | null
          reactive_energy_before_month_3?: number | null
          reactive_energy_before_month_4?: number | null
          reactive_energy_before_month_5?: number | null
          reactive_energy_before_month_6?: number | null
          reactive_energy_before_month_7?: number | null
          reactive_energy_before_month_8?: number | null
          reactive_energy_before_month_9?: number | null
          reactive_energy_cost_after?: number | null
          reactive_energy_cost_before?: number | null
          reactive_monthly_mode_after?: boolean
          reactive_monthly_mode_before?: boolean
          report_excluded_components?: string[]
          report_hidden_components?: string[]
          season_after?: string | null
          season_before?: string | null
          shared_power_mode?: boolean | null
          simulation_consumption_method?: string | null
          simulation_period_from?: string | null
          simulation_period_to?: string | null
          tariff_code_after?: string
          tariff_code_before?: string
          updated_at?: string
          value_sources?: Json
          variable_distribution_after_zone1_rate?: number | null
          variable_distribution_after_zone2_rate?: number | null
          variable_distribution_after_zone3_rate?: number | null
          variable_distribution_before_zone1_rate?: number | null
          variable_distribution_before_zone2_rate?: number | null
          variable_distribution_before_zone3_rate?: number | null
          zones_count_after?: number
          zones_count_before?: number
        }
        Update: {
          active_energy_price_after_zone1?: number | null
          active_energy_price_after_zone2?: number | null
          active_energy_price_after_zone3?: number | null
          active_energy_price_before_zone1?: number | null
          active_energy_price_before_zone2?: number | null
          active_energy_price_before_zone3?: number | null
          analysis_group_id?: string | null
          capacity_charge_after?: number | null
          capacity_charge_before?: number | null
          client_project_id?: string
          consultant_notes?: string | null
          consumption_after_zone1_mwh?: number | null
          consumption_after_zone2_mwh?: number | null
          consumption_after_zone3_mwh?: number | null
          consumption_before_zone1_mwh?: number | null
          consumption_before_zone2_mwh?: number | null
          consumption_before_zone3_mwh?: number | null
          consumption_zone1_mwh?: number | null
          consumption_zone2_mwh?: number | null
          consumption_zone3_mwh?: number | null
          contracted_power_after_kw?: number | null
          contracted_power_before_kw?: number | null
          contracted_power_charge_rate_after?: number | null
          contracted_power_charge_rate_before?: number | null
          cost_mode_before?: string
          created_at?: string
          fixed_distribution_after_total?: number | null
          fixed_distribution_before_total?: number | null
          handling_fee_after?: number | null
          handling_fee_before?: number | null
          id?: string
          include_in_project_report?: boolean
          name?: string
          osd_id?: string | null
          period_from?: string | null
          period_to?: string | null
          ppe_address?: string | null
          ppe_number?: string | null
          rate_card_id_after?: string | null
          rate_card_id_before?: string | null
          rates_date?: string | null
          rates_overridden_after?: Json | null
          rates_overridden_before?: Json | null
          rates_source_after?: Json | null
          rates_source_before?: Json | null
          rates_year_after?: number | null
          rates_year_before?: number | null
          reactive_energy_after_month_1?: number | null
          reactive_energy_after_month_10?: number | null
          reactive_energy_after_month_11?: number | null
          reactive_energy_after_month_12?: number | null
          reactive_energy_after_month_2?: number | null
          reactive_energy_after_month_3?: number | null
          reactive_energy_after_month_4?: number | null
          reactive_energy_after_month_5?: number | null
          reactive_energy_after_month_6?: number | null
          reactive_energy_after_month_7?: number | null
          reactive_energy_after_month_8?: number | null
          reactive_energy_after_month_9?: number | null
          reactive_energy_before_month_1?: number | null
          reactive_energy_before_month_10?: number | null
          reactive_energy_before_month_11?: number | null
          reactive_energy_before_month_12?: number | null
          reactive_energy_before_month_2?: number | null
          reactive_energy_before_month_3?: number | null
          reactive_energy_before_month_4?: number | null
          reactive_energy_before_month_5?: number | null
          reactive_energy_before_month_6?: number | null
          reactive_energy_before_month_7?: number | null
          reactive_energy_before_month_8?: number | null
          reactive_energy_before_month_9?: number | null
          reactive_energy_cost_after?: number | null
          reactive_energy_cost_before?: number | null
          reactive_monthly_mode_after?: boolean
          reactive_monthly_mode_before?: boolean
          report_excluded_components?: string[]
          report_hidden_components?: string[]
          season_after?: string | null
          season_before?: string | null
          shared_power_mode?: boolean | null
          simulation_consumption_method?: string | null
          simulation_period_from?: string | null
          simulation_period_to?: string | null
          tariff_code_after?: string
          tariff_code_before?: string
          updated_at?: string
          value_sources?: Json
          variable_distribution_after_zone1_rate?: number | null
          variable_distribution_after_zone2_rate?: number | null
          variable_distribution_after_zone3_rate?: number | null
          variable_distribution_before_zone1_rate?: number | null
          variable_distribution_before_zone2_rate?: number | null
          variable_distribution_before_zone3_rate?: number | null
          zones_count_after?: number
          zones_count_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "energy_analyses_analysis_group_id_fkey"
            columns: ["analysis_group_id"]
            isOneToOne: false
            referencedRelation: "analysis_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_analyses_client_project_id_fkey"
            columns: ["client_project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_analyses_osd_id_fkey"
            columns: ["osd_id"]
            isOneToOne: false
            referencedRelation: "osd_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_analyses_rate_card_id_after_fkey"
            columns: ["rate_card_id_after"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_analyses_rate_card_id_before_fkey"
            columns: ["rate_card_id_before"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_access_history: {
        Row: {
          actor_user_id: string
          changed_at: string
          feature: string
          id: string
          new_value: boolean
          old_value: boolean
          target_user_id: string
        }
        Insert: {
          actor_user_id: string
          changed_at?: string
          feature: string
          id?: string
          new_value: boolean
          old_value: boolean
          target_user_id: string
        }
        Update: {
          actor_user_id?: string
          changed_at?: string
          feature?: string
          id?: string
          new_value?: boolean
          old_value?: boolean
          target_user_id?: string
        }
        Relationships: []
      }
      invoice_file_cleanup: {
        Row: {
          actor_user_id: string | null
          attempts: number
          created_at: string
          file_path: string
          id: string
          last_error: string | null
        }
        Insert: {
          actor_user_id?: string | null
          attempts?: number
          created_at?: string
          file_path: string
          id?: string
          last_error?: string | null
        }
        Update: {
          actor_user_id?: string | null
          attempts?: number
          created_at?: string
          file_path?: string
          id?: string
          last_error?: string | null
        }
        Relationships: []
      }
      manager_assignments: {
        Row: {
          assigned_by_user_id: string | null
          created_at: string
          id: string
          managed_user_id: string
          manager_user_id: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          created_at?: string
          id?: string
          managed_user_id: string
          manager_user_id: string
        }
        Update: {
          assigned_by_user_id?: string | null
          created_at?: string
          id?: string
          managed_user_id?: string
          manager_user_id?: string
        }
        Relationships: []
      }
      osd_operators: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          region: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          region?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      osd_tariff_visibility: {
        Row: {
          created_at: string
          is_enabled: boolean
          osd_id: string
          tariff_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_enabled?: boolean
          osd_id: string
          tariff_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_enabled?: boolean
          osd_id?: string
          tariff_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "osd_tariff_visibility_osd_id_fkey"
            columns: ["osd_id"]
            isOneToOne: false
            referencedRelation: "osd_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          blocked_at: string | null
          created_at: string
          email: string
          email_verified: boolean | null
          id: string
          last_activity_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_at?: string | null
          created_at?: string
          email: string
          email_verified?: boolean | null
          id?: string
          last_activity_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_at?: string | null
          created_at?: string
          email?: string
          email_verified?: boolean | null
          id?: string
          last_activity_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_cards: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          osd_id: string
          source_document: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          osd_id: string
          source_document?: string | null
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          osd_id?: string
          source_document?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_osd_id_fkey"
            columns: ["osd_id"]
            isOneToOne: false
            referencedRelation: "osd_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          rate_card_id: string
          rate_type: string
          season: string | null
          tariff_code: string
          unit: string
          value: number
          zone_number: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          rate_card_id: string
          rate_type: string
          season?: string | null
          tariff_code: string
          unit: string
          value: number
          zone_number?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          rate_card_id?: string
          rate_type?: string
          season?: string | null
          tariff_code?: string
          unit?: string
          value?: number
          zone_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_items_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feature_access: {
        Row: {
          ai_assistant: boolean
          invoice_import: boolean
          multi_ppe: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_assistant?: boolean
          invoice_import?: boolean
          multi_ppe?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_assistant?: boolean
          invoice_import?: boolean
          multi_ppe?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_allowed_po_fields: { Args: never; Returns: string[] }
      ai_apply_proposal: {
        Args: { _expected_updated_at: string; _id: string }
        Returns: Json
      }
      ai_can_edit_analysis: { Args: { _analysis_id: string }; Returns: boolean }
      ai_proposal_guard: {
        Args: { _p: Database["public"]["Tables"]["ai_proposals"]["Row"] }
        Returns: undefined
      }
      ai_refresh_proposal: { Args: { _id: string }; Returns: string }
      ai_reject_proposal: { Args: { _id: string }; Returns: string }
      ai_undo_change: { Args: { _id: string }; Returns: Json }
      apply_invoice_period: {
        Args: { _analysis_id: string; _from: string; _to: string }
        Returns: undefined
      }
      can_access_analysis_group: {
        Args: { _group_id: string }
        Returns: boolean
      }
      can_delete_client_project: {
        Args: { _project_id: string }
        Returns: boolean
      }
      can_edit_feature_group: { Args: { _group_id: string }; Returns: boolean }
      delete_client_object: {
        Args: { _id: string; _kind: string }
        Returns: boolean
      }
      get_nip_owner: { Args: { _nip: string }; Returns: string }
      has_feature_access: { Args: { _feature: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_app_owner: { Args: never; Returns: boolean }
      is_manager_of: { Args: { _managed_user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "manager"
      project_status: "roboczy" | "wysłany klientowi" | "zaakceptowany"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "manager"],
      project_status: ["roboczy", "wysłany klientowi", "zaakceptowany"],
    },
  },
} as const
