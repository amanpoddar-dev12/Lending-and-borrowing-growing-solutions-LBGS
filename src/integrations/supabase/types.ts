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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          module: string | null
          new_value: Json | null
          old_value: Json | null
          remarks: string | null
          status: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          remarks?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          remarks?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_employees: {
        Row: {
          assigned_at: string
          client_id: string
          employee_id: string
        }
        Insert: {
          assigned_at?: string
          client_id: string
          employee_id: string
        }
        Update: {
          assigned_at?: string
          client_id?: string
          employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_employees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          address: string | null
          bank_account: string | null
          business_name: string
          business_type: string | null
          contact_person: string | null
          created_at: string
          credit_limit: number
          credit_status: string
          credit_terms: number
          email: string | null
          gst_number: string | null
          id: string
          kyc_documents: Json
          kyc_verified: boolean
          latitude: number | null
          longitude: number | null
          pan: string | null
          penalty_rate_per_day: number
          pending_credit_limit: number | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          bank_account?: string | null
          business_name: string
          business_type?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          credit_status?: string
          credit_terms?: number
          email?: string | null
          gst_number?: string | null
          id?: string
          kyc_documents?: Json
          kyc_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          pan?: string | null
          penalty_rate_per_day?: number
          pending_credit_limit?: number | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          bank_account?: string | null
          business_name?: string
          business_type?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          credit_status?: string
          credit_terms?: number
          email?: string | null
          gst_number?: string | null
          id?: string
          kyc_documents?: Json
          kyc_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          pan?: string | null
          penalty_rate_per_day?: number
          pending_credit_limit?: number | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_limit_requests: {
        Row: {
          client_id: string
          created_at: string
          credit_terms: number
          id: string
          previous_limit: number
          reason: string | null
          requested_by: string | null
          requested_limit: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          credit_terms: number
          id?: string
          previous_limit?: number
          reason?: string | null
          requested_by?: string | null
          requested_limit: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          credit_terms?: number
          id?: string
          previous_limit?: number
          reason?: string | null
          requested_by?: string | null
          requested_limit?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_limit_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_limit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_limit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purse: {
        Row: {
          client_id: string
          credit_limit: number
          last_updated: string
          remaining_credit: number
          used_credit: number
          utilization_percent: number
        }
        Insert: {
          client_id: string
          credit_limit?: number
          last_updated?: string
          remaining_credit?: number
          used_credit?: number
          utilization_percent?: number
        }
        Update: {
          client_id?: string
          credit_limit?: number
          last_updated?: string
          remaining_credit?: number
          used_credit?: number
          utilization_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_purse_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purse_events: {
        Row: {
          actor_id: string | null
          client_id: string
          created_at: string
          credit_limit: number
          delta: number
          event: string
          id: string
          remaining_after: number
          source_id: string | null
          source_table: string | null
          used_after: number
          used_before: number
        }
        Insert: {
          actor_id?: string | null
          client_id: string
          created_at?: string
          credit_limit?: number
          delta?: number
          event: string
          id?: string
          remaining_after?: number
          source_id?: string | null
          source_table?: string | null
          used_after?: number
          used_before?: number
        }
        Update: {
          actor_id?: string | null
          client_id?: string
          created_at?: string
          credit_limit?: number
          delta?: number
          event?: string
          id?: string
          remaining_after?: number
          source_id?: string | null
          source_table?: string | null
          used_after?: number
          used_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_purse_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_otps: {
        Row: {
          active: boolean
          attempts: number
          client_id: string
          code: string
          created_at: string
          employee_id: string | null
          expires_at: string
          id: string
          order_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          active?: boolean
          attempts?: number
          client_id: string
          code: string
          created_at?: string
          employee_id?: string | null
          expires_at: string
          id?: string
          order_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          active?: boolean
          attempts?: number
          client_id?: string
          code?: string
          created_at?: string
          employee_id?: string | null
          expires_at?: string
          id?: string
          order_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_otps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_otps_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_otps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_otps_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_sessions: {
        Row: {
          clock_in_time: string
          clock_out_time: string | null
          created_at: string
          duration_minutes: number | null
          employee_id: string
          id: string
        }
        Insert: {
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string
          duration_minutes?: number | null
          employee_id: string
          id?: string
        }
        Update: {
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_locations: {
        Row: {
          accuracy_meters: number | null
          address: string | null
          area: string | null
          captured_at: string
          city: string | null
          country: string | null
          district: string | null
          employee_id: string
          id: string
          latitude: number
          longitude: number
          place_name: string | null
          source: string | null
          state: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          address?: string | null
          area?: string | null
          captured_at?: string
          city?: string | null
          country?: string | null
          district?: string | null
          employee_id: string
          id?: string
          latitude: number
          longitude: number
          place_name?: string | null
          source?: string | null
          state?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          address?: string | null
          area?: string | null
          captured_at?: string
          city?: string | null
          country?: string | null
          district?: string | null
          employee_id?: string
          id?: string
          latitude?: number
          longitude?: number
          place_name?: string | null
          source?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_locations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          created_at: string
          employee_id: string
          granted_by: string | null
          permission: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          granted_by?: string | null
          permission: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          granted_by?: string | null
          permission?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          active: boolean
          base_salary: number
          commission_rate: number
          created_at: string
          id: string
          max_order_value: number
          order_limit: number
          reporting_manager_id: string | null
          territory: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          commission_rate?: number
          created_at?: string
          id: string
          max_order_value?: number
          order_limit?: number
          reporting_manager_id?: string | null
          territory?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          commission_rate?: number
          created_at?: string
          id?: string
          max_order_value?: number
          order_limit?: number
          reporting_manager_id?: string | null
          territory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profiles_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string | null
          visit_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string | null
          visit_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_visit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visit_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "field_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visits: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          client_id: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          id: string
          instructions: string | null
          location: string | null
          priority: Database["public"]["Enums"]["field_visit_priority"]
          prospect_name: string | null
          purpose: string
          status: Database["public"]["Enums"]["field_visit_status"]
          updated_at: string
          visit_date: string
          visit_time: string | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          instructions?: string | null
          location?: string | null
          priority?: Database["public"]["Enums"]["field_visit_priority"]
          prospect_name?: string | null
          purpose: string
          status?: Database["public"]["Enums"]["field_visit_status"]
          updated_at?: string
          visit_date: string
          visit_time?: string | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          id?: string
          instructions?: string | null
          location?: string | null
          priority?: Database["public"]["Enums"]["field_visit_priority"]
          prospect_name?: string | null
          purpose?: string
          status?: Database["public"]["Enums"]["field_visit_status"]
          updated_at?: string
          visit_date?: string
          visit_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_visits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_id: string | null
          payment_amount: number
          payment_date: string | null
          penalty_amount: number
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          due_date: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string | null
          payment_amount?: number
          payment_date?: string | null
          penalty_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string | null
          payment_amount?: number
          payment_date?: string | null
          penalty_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          reference_id: string | null
          running_balance: number
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          running_balance?: number
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          running_balance?: number
          type?: Database["public"]["Enums"]["ledger_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivery_status: string
          error_message: string | null
          id: string
          message: string | null
          sent_at: string | null
          user_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          message?: string | null
          sent_at?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          message?: string | null
          sent_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          read_at: string | null
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          reference_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_approvals: {
        Row: {
          action: string
          actor_id: string | null
          checklist: Json
          created_at: string
          id: string
          order_id: string
          remarks: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          checklist?: Json
          created_at?: string
          id?: string
          order_id: string
          remarks?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          checklist?: Json
          created_at?: string
          id?: string
          order_id?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_approvals_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          product_code: string | null
          product_name: string
          quantity: number
          rate: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          product_code?: string | null
          product_name: string
          quantity: number
          rate: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          product_code?: string | null
          product_name?: string
          quantity?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          method: string
          note: string | null
          order_id: string
          proof_path: string | null
          reference_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_verification_status"]
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          method: string
          note?: string | null
          order_id: string
          proof_path?: string | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_verification_status"]
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          order_id?: string
          proof_path?: string | null
          reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_verification_status"]
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          change_request: Json | null
          client_id: string
          created_at: string
          delivery_date: string | null
          employee_id: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          change_request?: Json | null
          client_id: string
          created_at?: string
          delivery_date?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          change_request?: Json | null
          client_id?: string
          created_at?: string
          delivery_date?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          amount_due: number
          client_id: string
          created_at: string
          credit_terms: number
          due_date: string
          employee_id: string | null
          id: string
          invoice_id: string | null
          notified_at: string | null
          order_id: string
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_due?: number
          client_id: string
          created_at?: string
          credit_terms?: number
          due_date: string
          employee_id?: string | null
          id?: string
          invoice_id?: string | null
          notified_at?: string | null
          order_id: string
          stage: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_due?: number
          client_id?: string
          created_at?: string
          credit_terms?: number
          due_date?: string
          employee_id?: string | null
          id?: string
          invoice_id?: string | null
          notified_at?: string | null
          order_id?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          payment_date: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          advance_deduction: number
          allowances: number
          basic_pay: number
          bonus: number
          commission: number
          created_at: string
          employee_id: string
          generated_at: string
          generated_by: string | null
          gross_earnings: number
          hra: number
          id: string
          net_pay: number
          notes: string | null
          other_deductions: number
          other_earnings: number
          period_month: number
          period_year: number
          pf: number
          professional_tax: number
          tds: number
          total_deductions: number
          updated_at: string
        }
        Insert: {
          advance_deduction?: number
          allowances?: number
          basic_pay?: number
          bonus?: number
          commission?: number
          created_at?: string
          employee_id: string
          generated_at?: string
          generated_by?: string | null
          gross_earnings?: number
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          other_earnings?: number
          period_month: number
          period_year: number
          pf?: number
          professional_tax?: number
          tds?: number
          total_deductions?: number
          updated_at?: string
        }
        Update: {
          advance_deduction?: number
          allowances?: number
          basic_pay?: number
          bonus?: number
          commission?: number
          created_at?: string
          employee_id?: string
          generated_at?: string
          generated_by?: string | null
          gross_earnings?: number
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          other_earnings?: number
          period_month?: number
          period_year?: number
          pf?: number
          professional_tax?: number
          tds?: number
          total_deductions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          file_url: string
          filename: string | null
          id: string
          task_id: string
          uploaded_at: string
        }
        Insert: {
          file_url: string
          filename?: string | null
          id?: string
          task_id: string
          uploaded_at?: string
        }
        Update: {
          file_url?: string
          filename?: string | null
          id?: string
          task_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_date: string
          completed_date: string | null
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_date?: string
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_date?: string
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_settings: {
        Row: {
          created_at: string
          language: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          language?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          language?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_review_payment: {
        Args: { p_action: string; p_payment_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_upsert_field_visit: {
        Args: { p_id: string; p_values: Json }
        Returns: string
      }
      client_cancel_order: { Args: { p_id: string }; Returns: undefined }
      client_respond_invoice: {
        Args: { p_action: string; p_id: string }
        Returns: undefined
      }
      client_review_order: {
        Args: {
          p_action: string
          p_checklist?: Json
          p_id: string
          p_remarks?: string
        }
        Returns: undefined
      }
      client_submit_payment: {
        Args: {
          p_amount: number
          p_method: string
          p_note?: string
          p_order_id: string
          p_proof_path?: string
          p_reference?: string
        }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      duty_clock_in: { Args: never; Returns: string }
      duty_clock_out: { Args: never; Returns: number }
      emp_create_client: { Args: { p_values: Json }; Returns: string }
      emp_mark_out_for_delivery: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      emp_regenerate_delivery_otp: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      emp_update_order_meta: {
        Args: { p_delivery_date: string; p_id: string; p_notes: string }
        Returns: undefined
      }
      emp_verify_delivery_otp: {
        Args: { p_code: string; p_order_id: string }
        Returns: undefined
      }
      generate_payment_reminders: { Args: never; Returns: number }
      has_employee_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned_employee: { Args: { _client_id: string }; Returns: boolean }
      issue_delivery_otp: {
        Args: { p_order_id: string; p_regenerated: boolean }
        Returns: undefined
      }
      mark_field_visits_overdue: { Args: never; Returns: number }
      refresh_credit_purse:
        | { Args: { _client_id: string }; Returns: undefined }
        | {
            Args: {
              _client_id: string
              _event?: string
              _source_id?: string
              _source_table?: string
            }
            Returns: undefined
          }
      review_credit_limit_request: {
        Args: { p_action: string; p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      set_field_visit_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: undefined
      }
      submit_credit_limit_request: {
        Args: { p_client_id: string; p_limit: number; p_terms: number }
        Returns: Json
      }
      submit_order_for_client: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "employee" | "client"
      field_visit_priority: "low" | "medium" | "high" | "urgent"
      field_visit_status:
        | "pending"
        | "assigned"
        | "completed"
        | "cancelled"
        | "overdue"
      invoice_status:
        | "sent"
        | "approved"
        | "declined"
        | "pending_payment"
        | "overdue"
        | "paid"
        | "partially_paid"
      ledger_type: "order" | "invoice" | "payment" | "penalty" | "adjustment"
      notification_channel: "whatsapp" | "email" | "sms" | "in_app"
      order_status:
        | "pending"
        | "confirmed"
        | "declined"
        | "change_requested"
        | "invoiced"
        | "paid"
        | "pending_client"
        | "client_approved"
        | "client_rejected"
        | "payment_pending"
        | "payment_submitted"
        | "payment_verified"
        | "out_for_delivery"
        | "completed"
      payment_verification_status: "submitted" | "verified" | "rejected"
      task_status: "todo" | "in_progress" | "completed"
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
      app_role: ["admin", "employee", "client"],
      field_visit_priority: ["low", "medium", "high", "urgent"],
      field_visit_status: [
        "pending",
        "assigned",
        "completed",
        "cancelled",
        "overdue",
      ],
      invoice_status: [
        "sent",
        "approved",
        "declined",
        "pending_payment",
        "overdue",
        "paid",
        "partially_paid",
      ],
      ledger_type: ["order", "invoice", "payment", "penalty", "adjustment"],
      notification_channel: ["whatsapp", "email", "sms", "in_app"],
      order_status: [
        "pending",
        "confirmed",
        "declined",
        "change_requested",
        "invoiced",
        "paid",
        "pending_client",
        "client_approved",
        "client_rejected",
        "payment_pending",
        "payment_submitted",
        "payment_verified",
        "out_for_delivery",
        "completed",
      ],
      payment_verification_status: ["submitted", "verified", "rejected"],
      task_status: ["todo", "in_progress", "completed"],
    },
  },
} as const
