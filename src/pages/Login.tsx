import React from 'react';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Navigate } from 'react-router-dom';

const Login = () => {
  const { session } = useAuth();

  // Redirect if already logged in
  if (session) {
    return <Navigate to="/app/inbox" replace />;
  }

  return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-600 text-white shadow-xl shadow-indigo-200 mb-6">
            <MessageSquare size={40} strokeWidth={2} />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">WhaDesk</h1>
          <p className="text-slate-500 mt-2 font-medium">Shared WhatsApp Inbox for Teams</p>
        </div>

        <div className="bg-white rounded-[2rem] shadow-2xl shadow-indigo-100 p-8 border border-indigo-50">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Agent Login</h2>
          
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#4f46e5',
                    brandAccent: '#4338ca',
                  },
                  radii: {
                    borderRadiusButton: '1rem',
                    buttonBorderRadius: '1rem',
                    inputBorderRadius: '1rem',
                  }
                }
              }
            }}
            theme="light"
          />

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center space-x-2 text-slate-500 text-sm">
            <ShieldCheck size={16} />
            <span>Secure Admin-provisioned access only</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;