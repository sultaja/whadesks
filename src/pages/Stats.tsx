import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Users, MessageSquare, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { subDays, format } from 'date-fns';

const Stats = () => {
  const [stats, setStats] = useState({
    totalMessages: 0,
    resolvedChats: 0,
    activeAgents: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [agentData, setAgentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 1. Get total messages
        const { count: msgCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true });

        // 2. Get resolved chats
        const { count: resolvedCount } = await supabase
          .from('chats')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'resolved');

        // 3. Get active agents
        const { count: agentsCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        setStats({
          totalMessages: msgCount || 0,
          resolvedChats: resolvedCount || 0,
          activeAgents: agentsCount || 0,
        });

        // 4. Chart Data (Last 7 days)
        const sevenDaysAgo = subDays(new Date(), 7);
        
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('created_at')
          .gte('created_at', sevenDaysAgo.toISOString());

        const { data: recentChats } = await supabase
          .from('chats')
          .select('updated_at, status')
          .gte('updated_at', sevenDaysAgo.toISOString())
          .eq('status', 'resolved');

        // Aggregate by day
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

        // 5. Agent Data
        const { data: chatsWithAgents } = await supabase
          .from('chats')
          .select('assigned_to, profiles(first_name)')
          .not('assigned_to', 'is', null);

        const agentCounts: Record<string, number> = {};
        chatsWithAgents?.forEach(c => {
          const name = c.profiles?.first_name || 'Unknown';
          agentCounts[name] = (agentCounts[name] || 0) + 1;
        });

        const formattedAgentData = Object.entries(agentCounts).map(([name, chats]) => ({
          name,
          chats
        })).sort((a, b) => b.chats - a.chats).slice(0, 5); // top 5

        setAgentData(formattedAgentData);

      } catch (error) {
        console.error('Error fetching stats:', error);
        showError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
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
            Last 7 Days
          </div>
        </div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<MessageSquare />} title="Total Messages" value={stats.totalMessages.toLocaleString()} />
          <StatCard icon={<CheckCircle />} title="Resolved Chats" value={stats.resolvedChats.toLocaleString()} />
          <StatCard icon={<Users />} title="Active Agents" value={stats.activeAgents.toLocaleString()} />
          <StatCard icon={<Clock />} title="Avg Response Time" value="< 5m" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Message Volume vs Resolution</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} allowDecimals={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="messages" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorMessages)" name="Messages" />
                  <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorResolved)" name="Resolved" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Chats per Agent</h3>
            <div className="h-80">
              {agentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontWeight: 600}} width={80} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '0.5rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="chats" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={24} name="Chats Handled" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center">
                  Not enough data to<br/>display agent stats
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, title, value }: any) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
    <div className="flex justify-between items-start mb-4">
      <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl">
        {React.cloneElement(icon, { size: 24, strokeWidth: 2 })}
      </div>
    </div>
    <div>
      <h4 className="text-slate-500 font-medium mb-1 text-sm">{title}</h4>
      <p className="text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  </div>
);

export default Stats;