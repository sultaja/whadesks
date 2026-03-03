import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Users, MessageSquare, Clock, CheckCircle, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { subDays, format } from 'date-fns';
import { useProfile } from '@/hooks/use-profile';

const Stats = () => {
  const { isAdmin, loading: profileLoading } = useProfile();
  const [stats, setStats] = useState({
    totalMessages: 0,
    resolvedChats: 0,
    activeAgents: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [agentData, setAgentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        // Fetch raw counts
        const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
        const { count: resolvedCount } = await supabase.from('chats').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
        const { count: agentsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });

        setStats({
          totalMessages: msgCount || 0,
          resolvedChats: resolvedCount || 0,
          activeAgents: agentsCount || 0,
        });

        // Generate chart data for last 7 days
        const sevenDaysAgo = subDays(new Date(), 7);
        const { data: recentMessages } = await supabase.from('messages').select('created_at').gte('created_at', sevenDaysAgo.toISOString());
        const { data: recentChats } = await supabase.from('chats').select('updated_at').gte('updated_at', sevenDaysAgo.toISOString()).eq('status', 'resolved');

        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = subDays(new Date(), 6 - i);
          return {
            name: format(d, 'EEE'),
            dateString: format(d, 'yyyy-MM-dd'),
            messages: 0,
            resolved: 0
          };
        });

        recentMessages?.forEach(m => {
          const dateStr = m.created_at.split('T')[0];
          const day = days.find(d => d.dateString === dateStr);
          if (day) day.messages++;
        });

        recentChats?.forEach(c => {
          const dateStr = c.updated_at.split('T')[0];
          const day = days.find(d => d.dateString === dateStr);
          if (day) day.resolved++;
        });

        setChartData(days);

        // Top Performers Logic
        const { data: chatsWithAgents } = await supabase.from('chats').select('assigned_to, profiles(first_name)').not('assigned_to', 'is', null);
        const agentCounts: Record<string, number> = {};
        chatsWithAgents?.forEach(c => {
          const name = c.profiles?.first_name || 'Unknown';
          agentCounts[name] = (agentCounts[name] || 0) + 1;
        });

        const formattedAgentData = Object.entries(agentCounts)
          .map(([name, chats]) => ({ name, chats }))
          .sort((a, b) => b.chats - a.chats)
          .slice(0, 5);
        
        setAgentData(formattedAgentData);

      } catch (error) {
        console.error('Error fetching stats:', error);
        showError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isAdmin, profileLoading]);

  if (profileLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-6 text-slate-400">
          <Lock size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Admin Only Area</h2>
        <p className="text-slate-500 mt-2 max-w-md">Statistics and system-wide metrics are restricted to administrators. Contact your supervisor for access.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Performance Overview</h1>
            <p className="text-slate-500 mt-1">Track agent efficiency and message volumes</p>
          </div>
          <div className="bg-white px-4 py-2 border border-slate-200 rounded-xl shadow-sm font-medium text-sm text-slate-600">
            System Admin View
          </div>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<MessageSquare />} title="Total Messages" value={stats.totalMessages.toLocaleString()} color="indigo" />
          <StatCard icon={<CheckCircle />} title="Resolved Chats" value={stats.resolvedChats.toLocaleString()} color="green" />
          <StatCard icon={<Users />} title="Active Agents" value={stats.activeAgents.toLocaleString()} color="purple" />
          <StatCard icon={<Clock />} title="Avg Response" value="4.2m" color="orange" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Volume Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Volume vs Resolution</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} allowDecimals={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="messages" stroke="#4f46e5" strokeWidth={3} fill="#4f46e5" fillOpacity={0.1} name="Messages" />
                  <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={3} fill="#10b981" fillOpacity={0.1} name="Resolved" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Agents Chart */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Top Performers</h3>
            <div className="h-80">
              {agentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontWeight: 600}} width={80} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '0.5rem', border: 'none' }} />
                    <Bar dataKey="chats" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={24} name="Chats" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center">No data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, title, value, color }: any) => {
  const colors: any = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
      <div className="flex justify-between items-start mb-4">
        <div className={`${colors[color] || colors.indigo} p-3 rounded-2xl`}>
          {React.cloneElement(icon, { size: 24, strokeWidth: 2 })}
        </div>
      </div>
      <div>
        <h4 className="text-slate-500 font-medium mb-1 text-sm">{title}</h4>
        <p className="text-3xl font-extrabold text-slate-900">{value}</p>
      </div>
    </div>
  );
};

export default Stats;