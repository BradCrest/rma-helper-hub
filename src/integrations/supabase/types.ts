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
      login_logs: {
        Row: {
          created_at: string
          email: string
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pending_admin_registrations: {
        Row: {
          email: string
          id: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      rma_customer_contacts: {
        Row: {
          contact_date: string
          contact_method: string | null
          contact_notes: string | null
          created_at: string
          id: string
          rma_request_id: string
        }
        Insert: {
          contact_date: string
          contact_method?: string | null
          contact_notes?: string | null
          created_at?: string
          id?: string
          rma_request_id: string
        }
        Update: {
          contact_date?: string
          contact_method?: string | null
          contact_notes?: string | null
          created_at?: string
          id?: string
          rma_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_customer_contacts_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_customer_feedback: {
        Row: {
          created_at: string
          feedback: string | null
          follow_up_date: string | null
          follow_up_method: string | null
          id: string
          rma_request_id: string
          satisfaction_score: number | null
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          follow_up_date?: string | null
          follow_up_method?: string | null
          id?: string
          rma_request_id: string
          satisfaction_score?: number | null
        }
        Update: {
          created_at?: string
          feedback?: string | null
          follow_up_date?: string | null
          follow_up_method?: string | null
          id?: string
          rma_request_id?: string
          satisfaction_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rma_customer_feedback_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_embeddings: {
        Row: {
          content: string
          content_type: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          rma_request_id: string
          updated_at: string
        }
        Insert: {
          content: string
          content_type?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          rma_request_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          rma_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_embeddings_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_repair_details: {
        Row: {
          actual_cost: number | null
          actual_method: string | null
          created_at: string
          estimated_cost: number | null
          id: string
          internal_reference: string | null
          planned_method: string | null
          replacement_model: string | null
          replacement_serial: string | null
          rma_request_id: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          actual_method?: string | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          internal_reference?: string | null
          planned_method?: string | null
          replacement_model?: string | null
          replacement_serial?: string | null
          rma_request_id: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          actual_method?: string | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          internal_reference?: string | null
          planned_method?: string | null
          replacement_model?: string | null
          replacement_serial?: string | null
          rma_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_repair_details_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: true
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_requests: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_email: string
          customer_issue: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string
          customer_type: string | null
          diagnosis_category: string | null
          id: string
          initial_diagnosis: string | null
          issue_description: string
          issue_type: string
          mobile_phone: string | null
          photo_urls: string[] | null
          product_model: string | null
          product_name: string
          purchase_date: string | null
          received_date: string | null
          rma_number: string
          serial_number: string | null
          social_account: string | null
          status: Database["public"]["Enums"]["rma_status"]
          updated_at: string
          warranty_date: string | null
          warranty_status: string | null
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_email: string
          customer_issue?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone: string
          customer_type?: string | null
          diagnosis_category?: string | null
          id?: string
          initial_diagnosis?: string | null
          issue_description: string
          issue_type: string
          mobile_phone?: string | null
          photo_urls?: string[] | null
          product_model?: string | null
          product_name: string
          purchase_date?: string | null
          received_date?: string | null
          rma_number: string
          serial_number?: string | null
          social_account?: string | null
          status?: Database["public"]["Enums"]["rma_status"]
          updated_at?: string
          warranty_date?: string | null
          warranty_status?: string | null
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_email?: string
          customer_issue?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string
          customer_type?: string | null
          diagnosis_category?: string | null
          id?: string
          initial_diagnosis?: string | null
          issue_description?: string
          issue_type?: string
          mobile_phone?: string | null
          photo_urls?: string[] | null
          product_model?: string | null
          product_name?: string
          purchase_date?: string | null
          received_date?: string | null
          rma_number?: string
          serial_number?: string | null
          social_account?: string | null
          status?: Database["public"]["Enums"]["rma_status"]
          updated_at?: string
          warranty_date?: string | null
          warranty_status?: string | null
        }
        Relationships: []
      }
      rma_shipping: {
        Row: {
          carrier: string | null
          created_at: string
          delivery_date: string | null
          direction: string
          id: string
          notes: string | null
          photo_url: string | null
          rma_request_id: string
          ship_date: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivery_date?: string | null
          direction: string
          id?: string
          notes?: string | null
          photo_url?: string | null
          rma_request_id: string
          ship_date?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivery_date?: string | null
          direction?: string
          id?: string
          notes?: string | null
          photo_url?: string | null
          rma_request_id?: string
          ship_date?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_shipping_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          rma_request_id: string
          status: Database["public"]["Enums"]["rma_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          rma_request_id: string
          status: Database["public"]["Enums"]["rma_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          rma_request_id?: string
          status?: Database["public"]["Enums"]["rma_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rma_status_history_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rma_supplier_repairs: {
        Row: {
          created_at: string
          factory_analysis: string | null
          factory_repair_cost: number | null
          factory_repair_method: string | null
          factory_return_date: string | null
          id: string
          inspection_result: string | null
          post_repair_action: string | null
          production_batch: string | null
          repair_count: number | null
          repair_requirement: string | null
          rma_request_id: string
          sent_carrier: string | null
          sent_to_factory_date: string | null
          sent_tracking_number: string | null
          supplier_status: string | null
          supplier_warranty_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          factory_analysis?: string | null
          factory_repair_cost?: number | null
          factory_repair_method?: string | null
          factory_return_date?: string | null
          id?: string
          inspection_result?: string | null
          post_repair_action?: string | null
          production_batch?: string | null
          repair_count?: number | null
          repair_requirement?: string | null
          rma_request_id: string
          sent_carrier?: string | null
          sent_to_factory_date?: string | null
          sent_tracking_number?: string | null
          supplier_status?: string | null
          supplier_warranty_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          factory_analysis?: string | null
          factory_repair_cost?: number | null
          factory_repair_method?: string | null
          factory_return_date?: string | null
          id?: string
          inspection_result?: string | null
          post_repair_action?: string | null
          production_batch?: string | null
          repair_count?: number | null
          repair_requirement?: string | null
          rma_request_id?: string
          sent_carrier?: string | null
          sent_to_factory_date?: string | null
          sent_tracking_number?: string | null
          supplier_status?: string | null
          supplier_warranty_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_supplier_repairs_rma_request_id_fkey"
            columns: ["rma_request_id"]
            isOneToOne: false
            referencedRelation: "rma_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      search_rma_embeddings: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          content_type: string
          id: string
          metadata: Json
          rma_request_id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      rma_status:
        | "registered"
        | "shipped"
        | "received"
        | "inspecting"
        | "contacting"
        | "quote_confirmed"
        | "paid"
        | "no_repair"
        | "repairing"
        | "shipped_back"
        | "follow_up"
        | "closed"
        | "shipped_back_refurbished"
        | "shipped_back_original"
        | "shipped_back_new"
        | "unknown"
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
      app_role: ["admin", "user", "super_admin"],
      rma_status: [
        "registered",
        "shipped",
        "received",
        "inspecting",
        "contacting",
        "quote_confirmed",
        "paid",
        "no_repair",
        "repairing",
        "shipped_back",
        "follow_up",
        "closed",
        "shipped_back_refurbished",
        "shipped_back_original",
        "shipped_back_new",
        "unknown",
      ],
    },
  },
} as const
