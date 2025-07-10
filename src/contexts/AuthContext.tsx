import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Update user status
        if (session?.user) {
          await updateUserStatus('online');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const updateUserStatus = async (status: 'online' | 'offline' | 'away') => {
    if (!user) return;

    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email!,
        status,
        last_active: new Date().toISOString(),
      });
  };

  const signIn = async (email: string, password: string, rememberMe = false) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }

      toast.success('Successfully signed in!');
    } catch (error: any) {
      let message = 'An error occurred during sign in';
      
      if (error.message === 'Invalid login credentials') {
        message = 'Invalid email or password';
      } else if (error.message === 'Email not confirmed') {
        message = 'Please confirm your email address';
      }
      
      toast.error(message);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) {
        throw error;
      }

      // If user was created successfully, ensure profile exists
      if (data.user && !data.user.email_confirmed_at) {
        // For new users, the profile should be created by the trigger
        // But let's add a small delay and check if we need to create it manually
        setTimeout(async () => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', data.user!.id)
              .single();

            if (!profile) {
              // Profile doesn't exist, create it manually
              await supabase
                .from('profiles')
                .insert({
                  id: data.user!.id,
                  email: data.user!.email!,
                  display_name: displayName,
                  status: 'offline',
                  last_active: new Date().toISOString(),
                });
            }
          } catch (error) {
            console.error('Error ensuring profile exists:', error);
          }
        }, 1000);
      }

      toast.success('Account created successfully! Please check your email for verification.');
    } catch (error: any) {
      let message = 'An error occurred during sign up';
      
      if (error.message === 'User already registered') {
        message = 'This email is already registered';
      }
      
      toast.error(message);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await updateUserStatus('offline');
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      localStorage.removeItem('rememberMe');
      toast.success('Signed out successfully');
    } catch (error: any) {
      toast.error('Error signing out');
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      toast.success('Password reset email sent!');
    } catch (error: any) {
      toast.error('Error sending reset email');
      throw error;
    }
  };

  // Update user status on page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (user) {
        updateUserStatus(document.hidden ? 'away' : 'online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  // Update user status before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) {
        updateUserStatus('offline');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  const value = {
    user,
    session,
    signIn,
    signUp,
    signOut,
    resetPassword,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};