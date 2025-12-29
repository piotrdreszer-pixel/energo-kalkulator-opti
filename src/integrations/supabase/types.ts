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
          period_from: string | null
          period_to: string | null
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
          period_from?: string | null
          period_to?: string | null
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
          period_from?: string | null
          period_to?: string | null
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
        ]
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
          verification_token: string | null
          verification_token_expires_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_verified?: boolean | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
          verification_token?: string | null
          verification_token_expires_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_verified?: boolean | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          verification_token?: string | null
          verification_token_expires_at?: string | null
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
