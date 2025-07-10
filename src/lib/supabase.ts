import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          status: 'online' | 'offline' | 'away';
          last_active: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          status?: 'online' | 'offline' | 'away';
          last_active?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          status?: 'online' | 'offline' | 'away';
          last_active?: string;
          created_at?: string;
        };
      };
      connections: {
        Row: {
          id: string;
          requester_id: string;
          receiver_id: string;
          status: 'pending' | 'accepted' | 'rejected';
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          receiver_id: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          receiver_id?: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          timestamp: string;
          type: 'text' | 'image' | 'file';
          read: boolean;
          file_url?: string;
          file_name?: string;
          file_size?: number;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          timestamp?: string;
          type?: 'text' | 'image' | 'file';
          read?: boolean;
          file_url?: string;
          file_name?: string;
          file_size?: number;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          content?: string;
          timestamp?: string;
          type?: 'text' | 'image' | 'file';
          read?: boolean;
          file_url?: string;
          file_name?: string;
          file_size?: number;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'connection_request' | 'message' | 'general';
          content: string;
          is_read: boolean;
          created_at: string;
          data?: any;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'connection_request' | 'message' | 'general';
          content: string;
          is_read?: boolean;
          created_at?: string;
          data?: any;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'connection_request' | 'message' | 'general';
          content?: string;
          is_read?: boolean;
          created_at?: string;
          data?: any;
        };
      };
    };
  };
};