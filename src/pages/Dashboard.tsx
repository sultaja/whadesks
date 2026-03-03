import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, CheckCircle2, AlertCircle, ArrowRight, TrendingUp, Users, Zap, Loader2, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    myOpen: 0,
    teamUnread: 0,
    todayResolved: 0
  });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      // Stats
      const { count: myOpen } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user?.id)
        .eq('status', 'open');

      const { count: teamUnread } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .gt('unread_count', 0);

      const today = new Date();
      today.setHours(0,0,0,0);
      const { count: todayResolved } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved')
        .gte('updated_at', today.toISOString());

      setStats({
        myOpen: myOpen || 0,
        teamUnread: teamUnread || 0,
        todayResolved: todayResolved || 0
      });

      // Recent Activity (Last 5 messages)
      const { data: events } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, sender_type,
          chats (
            contacts (name, phone_number)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      
      setRecentEvents(events || []);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Subscribe to real-time changes for messages and chats
    const channel = supabase.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Command Center</h1>
            <p className="text-slate-500 mt-2 text-lg">Welcome back. Here's what's happening today.</p>
          </div>
          <div className="flex items-center space-x-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>System Online</span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button 
            onClick={() => navigate('/app/inbox')}
            className="group bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all text-left relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-8 text-indigo-100 group-hover:text-indigo-500 transition-colors">
              <MessageSquare size={80} />
            </div>
            <h3 className="text-slate-500 font-bold uppercase text-xs tracking-widest mb-2">My Open Chats</h3>
            <p className="text-5xl font-black text-slate-900 mb-6">{stats.myOpen}</p>
            <div className="flex items-center text-indigo-600 font-bold text-sm">
              <span>Go to Inbox</span>
              <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-slate-500 font-bold uppercase text-xs tracking-widest mb-2">Team Unread</h3>
            <p className="text-5xl font-black text-slate-900 mb-6">{stats.teamUnread}</p>
            <div className="flex items-center text-orange-600 bg-orange-50 px-3 py-1 rounded-full w-fit text-xs font-bold border border-orange-100">
              <AlertCircle size={12} className="mr-1.5" />
              <span>Immediate Attention Required</span>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-slate-500 font-bold uppercase text-xs tracking-widest mb-2">Resolved Today</h3>
            <p className="text-5xl font-black text-slate-900 mb-6">{stats.todayResolved}</p>
            <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full w-fit text-xs font-bold border border-emerald-100">
              <TrendingUp size={12} className="mr-1.5" />
              <span>+12% from yesterday</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Activity Feed */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center space-x-3">
              <Activity size={24} className="text-indigo-600" />
              <span>Live Activity Feed</span>
            </h2>
            <div className="space-y-4">
              {recentEvents.length === 0 ? (
                <p className="text-slate-400 text-center py-10 italic">No recent activity found.</p>
              ) : (
                recentEvents.map(event => (
                  <div key={event.id} className="flex items-start space-x-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-indigo-100 transition-all">
                    <div className={`mt-1 p-2 rounded-xl ${event.sender_type === 'agent' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      <MessageSquare size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {event.chats?.contacts?.name || 'Customer'}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1 italic">"{event.content}"</p>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <button 
                onClick={() => navigate('/app/inbox')}
                className="w-full py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"
              >
                View Live Inbox
              </button>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center space-x-3">
                <Zap size={24} className="text-indigo-600" />
                <span>Quick Actions</span>
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <QuickActionCard 
                  icon={<Users />} 
                  title="Customers" 
                  desc="CRM Directory"
                  onClick={() => navigate('/app/contacts')}
                />
                <QuickActionCard 
                  icon={<Zap />} 
                  title="Replies" 
                  desc="Canned Library"
                  onClick={() => navigate('/app/replies')}
                />
              </div>
            </div>

            <div className="bg-indigo-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-bold mb-2">Team Status</h2>
                <p className="text-indigo-200 mb-8 max-w-xs">All systems are operational. You're doing great!</p>
                <button 
                  onClick={() => navigate('/app/agents')}
                  className="bg-white text-indigo-900 px-6 py-3 rounded-2xl font-bold hover:bg-indigo-50 transition-colors flex items-center space-x-2 shadow-lg"
                >
                  <span>Team Directory</span>
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="absolute bottom-[-20px] right-[-20px] opacity-10">
                <Users size={200} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({ icon, title, desc, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="p-5 rounded-3xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-200 hover:shadow-lg transition-all text-left group"
    >
      <div className="text-indigo-600 mb-4 bg-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
        {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      </div>
      <h4 className="font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
    </button>
  );
}