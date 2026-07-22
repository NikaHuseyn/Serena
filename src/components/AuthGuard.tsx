
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener with improved security logging
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Log security events for audit trail
        if (event === 'SIGNED_IN' && session?.user) {
          // Log successful authentication
          setTimeout(async () => {
            try {
              await supabase.rpc('log_security_event', {
                event_type: 'user_login',
                event_data: {
                  user_id: session.user.id,
                  login_method: session.user.app_metadata?.provider || 'email',
                  timestamp: new Date().toISOString()
                }
              });
            } catch (error) {
              console.error('Failed to log security event:', error);
            }
          }, 0);
        }
        
        if (event === 'SIGNED_OUT') {
          // Log sign out event
          setTimeout(async () => {
            try {
              await supabase.rpc('log_security_event', {
                event_type: 'user_logout',
                event_data: {
                  timestamp: new Date().toISOString()
                }
              });
            } catch (error) {
              console.error('Failed to log security event:', error);
            }
          }, 0);
        }
        
        if (!session) {
          navigate('/auth');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (!session) {
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface via-surface-variant to-surface flex items-center justify-center">
        <div className="card-elegant p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user || !session) {
    return null; // AuthGuard will redirect to auth page
  }

  return <>{children}</>;
};

export default AuthGuard;
