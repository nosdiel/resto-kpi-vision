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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_sales: {
        Row: {
          actual_customer_count: number
          actual_sales: number
          business_date: string
          created_at: string
          dessert_count: number
          id: string
          last_synced_at: string | null
          last_year_customer_count: number
          last_year_sales: number
          location_id: string
          original_actual_customer_count: number | null
          original_actual_sales: number | null
          overridden_at: string | null
          overridden_by: string | null
          override_note: string | null
          source: Database["public"]["Enums"]["sales_source"]
          updated_at: string
        }
        Insert: {
          actual_customer_count?: number
          actual_sales?: number
          business_date: string
          created_at?: string
          dessert_count?: number
          id?: string
          last_synced_at?: string | null
          last_year_customer_count?: number
          last_year_sales?: number
          location_id: string
          original_actual_customer_count?: number | null
          original_actual_sales?: number | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          source?: Database["public"]["Enums"]["sales_source"]
          updated_at?: string
        }
        Update: {
          actual_customer_count?: number
          actual_sales?: number
          business_date?: string
          created_at?: string
          dessert_count?: number
          id?: string
          last_synced_at?: string | null
          last_year_customer_count?: number
          last_year_sales?: number
          location_id?: string
          original_actual_customer_count?: number | null
          original_actual_sales?: number | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          source?: Database["public"]["Enums"]["sales_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      dessert_items: {
        Row: {
          active_from: string | null
          active_to: string | null
          created_at: string
          id: string
          location_id: string | null
          name: string
          square_item_id: string | null
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          square_item_id?: string | null
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          square_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dessert_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_year_settings: {
        Row: {
          created_at: string
          fiscal_year: number
          start_date: string
        }
        Insert: {
          created_at?: string
          fiscal_year: number
          start_date: string
        }
        Update: {
          created_at?: string
          fiscal_year?: number
          start_date?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          region: string | null
          timezone: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          region?: string | null
          timezone?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          timezone?: string
        }
        Relationships: []
      }
      pnl_vendors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string
          name: string
          section: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id: string
          name: string
          section: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          section?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pnl_vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      square_connections: {
        Row: {
          access_token: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          location_id: string
          merchant_id: string | null
          refresh_token: string | null
          square_location_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          location_id: string
          merchant_id?: string | null
          refresh_token?: string | null
          square_location_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          location_id?: string
          merchant_id?: string | null
          refresh_token?: string | null
          square_location_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "square_connections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      toast_connections: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          location_id: string
          toast_restaurant_guid: string
          updated_at: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          location_id: string
          toast_restaurant_guid: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          location_id?: string
          toast_restaurant_guid?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          id: string
          location_id: string
          user_id: string
        }
        Insert: {
          id?: string
          location_id: string
          user_id: string
        }
        Update: {
          id?: string
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_pnl: {
        Row: {
          beer_wine_cost: number
          catering: number | null
          created_at: string
          fiscal_week: number
          fiscal_year: number
          id: string
          location_id: string
          notes: string | null
          repairs: number
          updated_at: string
          updated_by: string | null
          vendor_amounts: Json
          wages: number
        }
        Insert: {
          beer_wine_cost?: number
          catering?: number | null
          created_at?: string
          fiscal_week: number
          fiscal_year: number
          id?: string
          location_id: string
          notes?: string | null
          repairs?: number
          updated_at?: string
          updated_by?: string | null
          vendor_amounts?: Json
          wages?: number
        }
        Update: {
          beer_wine_cost?: number
          catering?: number | null
          created_at?: string
          fiscal_week?: number
          fiscal_year?: number
          id?: string
          location_id?: string
          notes?: string | null
          repairs?: number
          updated_at?: string
          updated_by?: string | null
          vendor_amounts?: Json
          wages?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_pnl_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_targets: {
        Row: {
          avg_ticket_goal: number | null
          created_at: string
          created_by: string | null
          fiscal_week: number
          fiscal_year: number
          id: string
          location_id: string
          notes: string | null
          target_pct_over_ly: number
          updated_at: string
        }
        Insert: {
          avg_ticket_goal?: number | null
          created_at?: string
          created_by?: string | null
          fiscal_week: number
          fiscal_year: number
          id?: string
          location_id: string
          notes?: string | null
          target_pct_over_ly?: number
          updated_at?: string
        }
        Update: {
          avg_ticket_goal?: number | null
          created_at?: string
          created_by?: string | null
          fiscal_week?: number
          fiscal_year?: number
          id?: string
          location_id?: string
          notes?: string | null
          target_pct_over_ly?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_targets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "regional_manager" | "store_manager" | "super_admin"
      sales_source: "square" | "manual" | "toast"
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
      app_role: ["admin", "regional_manager", "store_manager", "super_admin"],
      sales_source: ["square", "manual", "toast"],
    },
  },
} as const
