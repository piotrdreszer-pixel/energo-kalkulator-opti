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
          created_at: string
          fixed_distribution_after_total: number | null
          fixed_distribution_before_total: number | null
          handling_fee_after: number | null
          handling_fee_before: number | null
          id: string
          name: string
          osd_id: string | null
          period_from: string | null
          period_to: string | null
          rate_card_id_after: string | null
          rate_card_id_before: string | null
          rates_date: string | null
          rates_overridden_after: Json | null
          rates_overridden_before: Json | null
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
          season_after: string | null
          season_before: string | null
          shared_power_mode: boolean | null
          tariff_code_after: string
          tariff_code_before: string
          updated_at: string
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
          created_at?: string
          fixed_distribution_after_total?: number | null
          fixed_distribution_before_total?: number | null
          handling_fee_after?: number | null
          handling_fee_before?: number | null
          id?: string
          name?: string
          osd_id?: string | null
          period_from?: string | null
          period_to?: string | null
          rate_card_id_after?: string | null
          rate_card_id_before?: string | null
          rates_date?: string | null
          rates_overridden_after?: Json | null
          rates_overridden_before?: Json | null
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
          season_after?: string | null
          season_before?: string | null
          shared_power_mode?: boolean | null
          tariff_code_after?: string
          tariff_code_before?: string
          updated_at?: string
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
          created_at?: string
          fixed_distribution_after_total?: number | null
          fixed_distribution_before_total?: number | null
          handling_fee_after?: number | null
          handling_fee_before?: number | null
          id?: string
          name?: string
          osd_id?: string | null
          period_from?: string | null
          period_to?: string | null
          rate_card_id_after?: string | null
          rate_card_id_before?: string | null
          rates_date?: string | null
          rates_overridden_after?: Json | null
          rates_overridden_before?: Json | null
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
          season_after?: string | null
          season_before?: string | null
          shared_power_mode?: boolean | null
          tariff_code_after?: string
          tariff_code_before?: string
          updated_at?: string
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
      profiles: {
        Row: {
          created_at: string
          email: string
          email_verified: boolean | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          email_verified?: boolean | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          email_verified?: boolean | null
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      project_status: ["roboczy", "wysłany klientowi", "zaakceptowany"],
    },
  },
} as const
