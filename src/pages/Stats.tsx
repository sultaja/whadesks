import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Users, MessageSquare, Clock, CheckCircle, Loader2, Lock, RefreshCw,
  TrendingUp, PhoneOff, MessageCircle, StickyNote, Inbox,
  Award, Activity, Timer, Zap, AlertCircle, CalendarDays, ChevronDown, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import {
  format, startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subWeeks, subMonths,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  differenceInDays, differenceInMonths,
} from 'date-fns';
import { useProfile } from '@/hooks/use-profile';

const WA_BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────

type PresetKey =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_year' | 'custom';

interface ActiveRange {
  preset: PresetKey;
  start: Date;
  end: Date;
}

interface KpiData {
  totalContacts: number; openChats: number; resolvedChats: number; snoozedChats: number;
  totalMessages: number; agentMessages: number; customerMessages: number; notesCount: number;
  blockedContacts: number; totalAgents: number;
}

interface DayPoint {
  label: string; date: string;
  messages: number; agentMessages: number; resolved: number; newContacts: number;
}

interface AgentRow {
  id: string; name: string;
  assignedChats: number; resolvedChats: number; messagesSent: number; notes: number; resolutionRate: number;
}

interface TimingPlatform {
  avgFrtMin: number; medianFrtMin: number; avgRtHours: number; medianRtHours: number;
  totalChatsWithFrt: number; totalResolved: number;
}

interface BucketPoint { label: string; count: number; }

interface AgentTiming {
  id: string; name: string;
  avgFrtMin: number; medianFrtMin: number; avgRtHours: number; medianRtHours: number;
  chatsWithFrt: number; resolvedChats: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS = ['#6366f1', '#10b981', '#f59e0b'];
const CHART_COLORS  = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

type PresetDef = { key: PresetKey; label: string };

const PRESETS: PresetDef[] = [
  { key: 'today',       label: 'Today'      },
  { key: 'yesterday',   label: 'Yesterday'  },
  { key: 'this_week',   label: 'This Week'  },
  { key: 'last_week',   label: 'Last Week'  },
  { key: 'this_month',  label: 'This Month' },
  { key: 'last_month',  label: 'Last Month' },
  { key: 'this_year',   label: 'This Year'  },
  { key: 'custom',      label: 'Custom…'    },
];

// ─── Date range helpers ───────────────────────────────────────────────────────

function resolvePreset(key: PresetKey, customStart?: Date, customEnd?: Date): ActiveRange {
  const now = new Date();
  switch (key) {
    case 'today':      return { preset: key, start: startOfDay(now),                       end: endOfDay(now) };
    case 'yesterday':  return { preset: key, start: startOfDay(subDays(now, 1)),            end: endOfDay(subDays(now, 1)) };
    case 'this_week':  return { preset: key, start: startOfWeek(now, { weekStartsOn: 1 }),  end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week':  return { preset: key, start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), end: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) };
    case 'this_month': return { preset: key, start: startOfMonth(now),                      end: endOfMonth(now) };
    case 'last_month': return { preset: key, start: startOfMonth(subMonths(now, 1)),         end: endOfMonth(subMonths(now, 1)) };
    case 'this_year':  return { preset: key, start: startOfYear(now),                        end: endOfYear(now) };
    case 'custom':     return { preset: key, start: customStart ?? startOfDay(subDays(now, 29)), end: customEnd ?? endOfDay(now) };
  }
}

function presetLabel(ar: ActiveRange): string {
  if (ar.preset === 'custom') return `${format(ar.start, 'MMM d, yyyy')} – ${format(ar.end, 'MMM d, yyyy')}`;
  return PRESETS.find(p => p.key === ar.preset)?.label ?? '';
}

/** Build chart data points between start and end.
 *  Automatically groups: ≤60 days → daily, ≤180 → weekly, >180 → monthly */
function buildPoints(start: Date, end: Date): DayPoint[] {
  const diff = differenceInDays(end, start);
  if (diff <= 60) {
    return eachDayOfInterval({ start, end }).map(d => ({
      label: diff <= 14 ? format(d, 'EEE d') : format(d, 'MMM d'),
      date: format(d, 'yyyy-MM-dd'),
      messages: 0, agentMessages: 0, resolved: 0, newContacts: 0,
    }));
  }
  if (diff <= 180) {
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(wStart => {
      const label = format(wStart, 'MMM d');
      // Store the ISO week's Monday date as the key
      return { label, date: format(wStart, 'yyyy-MM-dd'), messages: 0, agentMessages: 0, resolved: 0, newContacts: 0 };
    });
  }
  // Monthly grouping
  return eachMonthOfInterval({ start, end }).map(mStart => ({
    label: format(mStart, 'MMM yyyy'),
    date: format(mStart, 'yyyy-MM'),
    messages: 0, agentMessages: 0, resolved: 0, newContacts: 0,
  }));
}

/** Find which chart point a date string belongs to */
function assignToPoint(points: DayPoint[], isoDate: string): DayPoint | undefined {
  if (points.length === 0) return undefined;
  const dateKey = isoDate.slice(0, 10); // yyyy-MM-dd
  // Daily: exact match
  if (points[0].date.length === 10) return points.find(p => p.date === dateKey);
  // Monthly (yyyy-MM): prefix match
  if (points[0].date.length === 7) return points.find(p => dateKey.startsWith(p.date));
  // Weekly: find the last point whose date <= dateKey
  let match: DayPoint | undefined;
  for (const p of points) { if (p.date <= dateKey) match = p; else break; }
  return match;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtMin(minutes: number): string {
  if (!minutes || minutes < 0) return '—';
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24); const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function fmtHours(hours: number): string {
  if (!hours || hours < 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) { const h = Math.floor(hours); const m = Math.round((hours - h) * 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  const d = Math.floor(hours / 24); const rh = Math.round(hours % 24);
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function frtColor(min: number) { return !min ? 'text-slate-400' : min < 15 ? 'text-emerald-600' : min < 60 ? 'text-amber-600' : 'text-red-500'; }
function rtColor(hours: number) { return !hours ? 'text-slate-400' : hours < 4 ? 'text-emerald-600' : hours < 24 ? 'text-amber-600' : 'text-red-500'; }

// ─── Date Range Picker ────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: ActiveRange;
  onChange: (r: ActiveRange) => void;
}

function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(format(value.start, 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(value.end, 'yyyy-MM-dd'));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectPreset = (key: PresetKey) => {
    if (key === 'custom') return; // stay open for custom input
    const r = resolvePreset(key);
    onChange(r);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const s = startOfDay(new Date(customStart));
    const e = endOfDay(new Date(customEnd));
    if (s > e) return;
    onChange(resolvePreset('custom', s, e));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 pl-3 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all min-w-0"
      >
        <CalendarDays size={15} className="text-indigo-500 shrink-0" />
        <span className="truncate max-w-[220px]">{presetLabel(value)}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-slate-900/10 overflow-hidden w-72">
          {/* Preset list */}
          <div className="p-2 grid grid-cols-2 gap-1">
            {PRESETS.filter(p => p.key !== 'custom').map(p => (
              <button
                key={p.key}
                onClick={() => selectPreset(p.key)}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all
                  ${value.preset === p.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Custom Range</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1 px-1">From</label>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1 px-1">To</label>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              disabled={!customStart || !customEnd || customStart > customEnd}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Apply Custom Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, title, value, sub, color, valueClass }: {
  icon: React.ReactNode; title: string; value: string | number;
  sub?: string; color: string; valueClass?: string;
}) {
  const cMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',   green:  'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',    orange: 'bg-orange-50 text-orange-600',
    red:    'bg-red-50 text-red-500',          sky:    'bg-sky-50 text-sky-600',
    amber:  'bg-amber-50 text-amber-600',      teal:   'bg-teal-50 text-teal-600',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col gap-3">
      <div className={`${cMap[color] ?? cMap.indigo} p-2.5 rounded-xl w-fit`}>
        {React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
        <p className={`text-3xl font-extrabold mt-0.5 ${valueClass ?? 'text-slate-900 dark:text-slate-100'}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-800 dark:text-slate-100 ml-1">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const Stats = () => {
  const { isAdmin, loading: profileLoading } = useProfile();
  const [activeRange, setActiveRange] = useState<ActiveRange>(() => resolvePreset('this_week'));

  const [kpi, setKpi] = useState<KpiData>({
    totalContacts: 0, openChats: 0, resolvedChats: 0, snoozedChats: 0,
    totalMessages: 0, agentMessages: 0, customerMessages: 0, notesCount: 0,
    blockedContacts: 0, totalAgents: 0,
  });
  const [dayPoints,      setDayPoints]      = useState<DayPoint[]>([]);
  const [agentRows,      setAgentRows]      = useState<AgentRow[]>([]);
  const [timingPlatform, setTimingPlatform] = useState<TimingPlatform | null>(null);
  const [frtDist,        setFrtDist]        = useState<BucketPoint[]>([]);
  const [rtDist,         setRtDist]         = useState<BucketPoint[]>([]);
  const [agentTiming,    setAgentTiming]    = useState<AgentTiming[]>([]);
  const [timingError,    setTimingError]    = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null);

  // ── Fetch all stats ─────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setTimingError(null);
    try {
      const since = activeRange.start.toISOString();
      const until = endOfDay(activeRange.end).toISOString();

      // ── KPIs (scoped to range for messages/chats, all-time for totals) ────────
      const [
        { count: totalContacts },  { count: openChats },
        { count: resolvedChats },  { count: snoozedChats },
        { count: totalMessages },  { count: agentMessages },
        { count: customerMessages }, { count: notesCount },
        { count: blockedContacts }, { count: totalAgents },
      ] = await Promise.all([
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('chats').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('chats').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
        supabase.from('chats').select('*', { count: 'exact', head: true }).eq('status', 'snoozed'),
        supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', since).lte('created_at', until),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_type', 'agent').gte('created_at', since).lte('created_at', until),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_type', 'customer').gte('created_at', since).lte('created_at', until),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_type', 'note').gte('created_at', since).lte('created_at', until),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('is_blocked', true),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ]);

      setKpi({
        totalContacts: totalContacts ?? 0,   openChats:    openChats    ?? 0,
        resolvedChats: resolvedChats ?? 0,   snoozedChats: snoozedChats ?? 0,
        totalMessages: totalMessages ?? 0,   agentMessages: agentMessages ?? 0,
        customerMessages: customerMessages ?? 0, notesCount: notesCount ?? 0,
        blockedContacts: blockedContacts ?? 0, totalAgents: totalAgents ?? 0,
      });

      // ── Time series ─────────────────────────────────────────────────────────
      const [{ data: rangeMessages }, { data: rangeResolved }, { data: rangeContacts }] = await Promise.all([
        supabase.from('messages').select('created_at, sender_type').gte('created_at', since).lte('created_at', until),
        supabase.from('chats').select('updated_at').eq('status', 'resolved').gte('updated_at', since).lte('updated_at', until),
        supabase.from('contacts').select('created_at').gte('created_at', since).lte('created_at', until),
      ]);

      const points = buildPoints(activeRange.start, activeRange.end);
      rangeMessages?.forEach(m => {
        const p = assignToPoint(points, m.created_at.slice(0, 10));
        if (!p) return; p.messages++;
        if (m.sender_type === 'agent') p.agentMessages++;
      });
      rangeResolved?.forEach(c => { const p = assignToPoint(points, c.updated_at.slice(0, 10)); if (p) p.resolved++; });
      rangeContacts?.forEach(c => { const p = assignToPoint(points, c.created_at.slice(0, 10)); if (p) p.newContacts++; });
      setDayPoints(points);

      // ── Agent performance ───────────────────────────────────────────────────
      const { data: profiles }       = await supabase.from('profiles').select('id, first_name, last_name');
      const { data: allChats }        = await supabase.from('chats').select('id, status, assigned_to').not('assigned_to', 'is', null);
      const { data: agentMsgsRange }  = await supabase.from('messages').select('sender_id').eq('sender_type', 'agent').gte('created_at', since).lte('created_at', until);
      const { data: agentNotesRange } = await supabase.from('messages').select('sender_id').eq('sender_type', 'note').gte('created_at', since).lte('created_at', until);

      const rows: AgentRow[] = (profiles ?? []).map(p => {
        const name       = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        const myChats    = allChats?.filter(c => c.assigned_to === p.id) ?? [];
        const myResolved = myChats.filter(c => c.status === 'resolved').length;
        const myMsgs     = agentMsgsRange?.filter(m => m.sender_id === p.id).length ?? 0;
        const myNotes    = agentNotesRange?.filter(m => m.sender_id === p.id).length ?? 0;
        const rate       = myChats.length > 0 ? Math.round((myResolved / myChats.length) * 100) : 0;
        return { id: p.id, name, assignedChats: myChats.length, resolvedChats: myResolved, messagesSent: myMsgs, notes: myNotes, resolutionRate: rate };
      }).sort((a, b) => b.assignedChats - a.assignedChats);
      setAgentRows(rows);

      // ── Timing analytics (backend) ──────────────────────────────────────────
      try {
        const tresp = await fetch(`${WA_BACKEND}/api/analytics/timing?since=${encodeURIComponent(since)}`);
        const tdata = await tresp.json();
        if (!tresp.ok) throw new Error(tdata.error);
        setTimingPlatform(tdata.platform);
        setFrtDist(tdata.frtDistribution);
        setRtDist(tdata.rtDistribution);
        setAgentTiming(tdata.agentTiming);
      } catch (te: any) { setTimingError(te.message); }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Stats fetch error:', err);
      showError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [activeRange]);

  useEffect(() => {
    if (!profileLoading && isAdmin) fetchStats();
    else if (!profileLoading) setLoading(false);
  }, [isAdmin, profileLoading, fetchStats]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const statusPie = [
    { name: 'Open',     value: kpi.openChats    },
    { name: 'Resolved', value: kpi.resolvedChats },
    { name: 'Snoozed',  value: kpi.snoozedChats  },
  ].filter(s => s.value > 0);

  const msgTypePie = [
    { name: 'Customer', value: kpi.customerMessages },
    { name: 'Agent',    value: kpi.agentMessages    },
    { name: 'Notes',    value: kpi.notesCount       },
  ].filter(s => s.value > 0);

  const topAgents      = agentRows.filter(a => a.assignedChats > 0).slice(0, 6);
  const totalChats     = kpi.openChats + kpi.resolvedChats + kpi.snoozedChats;
  const resolutionRate = totalChats > 0 ? Math.round((kpi.resolvedChats / totalChats) * 100) : 0;

  const mergedAgentTable = agentRows.map(r => {
    const t = agentTiming.find(a => a.id === r.id);
    return { ...r, avgFrtMin: t?.avgFrtMin ?? 0, medianFrtMin: t?.medianFrtMin ?? 0, avgRtHours: t?.avgRtHours ?? 0, medianRtHours: t?.medianRtHours ?? 0, chatsWithFrt: t?.chatsWithFrt ?? 0 };
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  if (profileLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  if (!isAdmin) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
      <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-6 text-slate-400"><Lock size={40} /></div>
      <h2 className="text-2xl font-bold text-slate-800">Admin Only Area</h2>
      <p className="text-slate-500 mt-2 max-w-md">Statistics and metrics are restricted to administrators.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Activity size={24} className="text-indigo-600" /> Analytics
            </h1>
            {lastUpdated && <p className="text-xs text-slate-400 mt-0.5">Updated {format(lastUpdated, 'HH:mm:ss')}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePicker value={activeRange} onChange={r => { setActiveRange(r); }} />
            <button onClick={fetchStats} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Selected range badge ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CalendarDays size={13} className="text-indigo-400" />
          <span>
            Showing data from <span className="font-semibold text-slate-700 dark:text-slate-300">{format(activeRange.start, 'MMM d, yyyy')}</span>
            {' '}to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{format(activeRange.end, 'MMM d, yyyy')}</span>
            {' '}({differenceInDays(activeRange.end, activeRange.start) + 1} days)
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={36} className="animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {/* ── KPI Row 1: Volume ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard icon={<Users />}      title="Total Contacts"  value={kpi.totalContacts}   color="indigo" />
              <StatCard icon={<Inbox />}       title="Open Chats"      value={kpi.openChats}       color="sky" />
              <StatCard icon={<CheckCircle />} title="Resolved Chats"  value={kpi.resolvedChats}   color="green" />
              <StatCard icon={<Clock />}       title="Snoozed"         value={kpi.snoozedChats}    color="amber" />
              <StatCard icon={<TrendingUp />}  title="Resolution Rate" value={`${resolutionRate}%`} color="purple" sub={`${totalChats} total chats`} />
            </div>

            {/* ── KPI Row 2: Messages ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard icon={<MessageSquare />} title="Messages (Range)"    value={kpi.totalMessages}    color="indigo" />
              <StatCard icon={<MessageCircle />} title="Customer Messages"  value={kpi.customerMessages} color="sky" />
              <StatCard icon={<MessageSquare />} title="Agent Messages"     value={kpi.agentMessages}    color="green" />
              <StatCard icon={<StickyNote />}    title="Internal Notes"     value={kpi.notesCount}       color="orange" />
              <StatCard icon={<PhoneOff />}      title="Blocked Contacts"   value={kpi.blockedContacts}  color="red" />
            </div>

            {/* ── KPI Row 3: Timing ─────────────────────────────────────────── */}
            {timingError ? (
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <p className="text-amber-700 dark:text-amber-400">Timing metrics unavailable: <span className="font-medium">{timingError}</span></p>
              </div>
            ) : timingPlatform && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <Timer size={16} className="text-indigo-500" />
                  <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Response & Resolution Times</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={<Zap />}         title="Avg First Response"    color="indigo" value={fmtMin(timingPlatform.avgFrtMin)}    sub={`Median ${fmtMin(timingPlatform.medianFrtMin)} · ${timingPlatform.totalChatsWithFrt} chats`} valueClass={frtColor(timingPlatform.avgFrtMin)} />
                  <StatCard icon={<Timer />}        title="Median First Response" color="sky"    value={fmtMin(timingPlatform.medianFrtMin)}  sub={`${timingPlatform.totalChatsWithFrt} chats measured`} valueClass={frtColor(timingPlatform.medianFrtMin)} />
                  <StatCard icon={<CheckCircle />}  title="Avg Resolution Time"   color="green"  value={fmtHours(timingPlatform.avgRtHours)}  sub={`Median ${fmtHours(timingPlatform.medianRtHours)} · ${timingPlatform.totalResolved} resolved`} valueClass={rtColor(timingPlatform.avgRtHours)} />
                  <StatCard icon={<Clock />}        title="Median Resolution Time" color="teal"  value={fmtHours(timingPlatform.medianRtHours)} sub={`${timingPlatform.totalResolved} resolved chats`} valueClass={rtColor(timingPlatform.medianRtHours)} />
                </div>
              </>
            )}

            {/* ── Charts Row 1: Volume + Status ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">Message Volume</h3>
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-1 bg-indigo-500 rounded inline-block" />All</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-1 bg-emerald-500 rounded inline-block" />Resolved</span>
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dayPoints} margin={{ left: -20 }}>
                      <defs>
                        <linearGradient id="gMsgs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gRes" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8}
                        interval={dayPoints.length > 30 ? Math.floor(dayPoints.length / 12) : 0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="messages" stroke="#6366f1" strokeWidth={2.5} fill="url(#gMsgs)" name="Messages" />
                      <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2.5} fill="url(#gRes)" name="Resolved" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-5">Chat Status</h3>
                <div className="h-44">
                  {statusPie.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusPie} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                          {statusPie.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [v, '']} contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs font-medium text-slate-600">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">No data</div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 font-medium">Resolution rate</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{resolutionRate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${resolutionRate}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Charts Row 2: FRT + RT distributions ─────────────────────── */}
            {(frtDist.length > 0 || rtDist.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">First Response Time Distribution</h3>
                  <p className="text-xs text-slate-400 mb-5">How fast do agents send their first reply?</p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={frtDist} margin={{ left: -20 }}>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Chats" radius={[6, 6, 0, 0]} maxBarSize={40}>
                          {frtDist.map((e, i) => <Cell key={i} fill={['< 5m','5–15m'].includes(e.label) ? '#10b981' : ['15–30m','30–60m'].includes(e.label) ? '#f59e0b' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs font-medium justify-center">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Fast (≤ 15m)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-500 inline-block" /> Medium</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500 inline-block" /> Slow (&gt; 1h)</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Resolution Time Distribution</h3>
                  <p className="text-xs text-slate-400 mb-5">How long does it take to resolve a chat?</p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rtDist} margin={{ left: -20 }}>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Chats" radius={[6, 6, 0, 0]} maxBarSize={40}>
                          {rtDist.map((e, i) => <Cell key={i} fill={['< 1h','1–4h'].includes(e.label) ? '#10b981' : ['4–24h','1–3d'].includes(e.label) ? '#f59e0b' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs font-medium justify-center">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Quick (≤ 4h)</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-500 inline-block" /> Medium</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500 inline-block" /> Long (&gt; 3d)</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Charts Row 3: New Contacts + Message Breakdown ─────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-5">New Contacts</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayPoints} margin={{ left: -20 }}>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8}
                        interval={dayPoints.length > 30 ? Math.floor(dayPoints.length / 12) : 0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="newContacts" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="New Contacts" maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-5">Message Breakdown</h3>
                <div className="h-44">
                  {msgTypePie.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={msgTypePie} cx="50%" cy="50%" innerRadius={40} outerRadius={64} paddingAngle={3} dataKey="value">
                          {msgTypePie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [v, '']} contentStyle={{ borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs font-medium text-slate-600">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No data</div>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'Customer', val: kpi.customerMessages, color: 'text-indigo-600' },
                    { label: 'Agent',    val: kpi.agentMessages,    color: 'text-emerald-600' },
                    { label: 'Notes',    val: kpi.notesCount,       color: 'text-amber-600' },
                  ].map(x => (
                    <div key={x.label}>
                      <p className={`text-lg font-extrabold ${x.color}`}>{x.val}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{x.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Agent Performance Table ──────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Award size={18} className="text-indigo-500" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Agent Performance</h3>
                <span className="text-xs text-slate-400 ml-1">— {presetLabel(activeRange)}</span>
              </div>
              {mergedAgentTable.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">No agent data</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-left">
                        {['Agent','Assigned','Resolved','Msgs','Notes','Resolution %','Avg First Response','Median First Response','Avg Resolution Time','Median Resolution Time'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mergedAgentTable.map((a, i) => (
                        <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                                {a.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{a.name}</span>
                              {i === 0 && a.assignedChats > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">TOP</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-300">{a.assignedChats}</td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-emerald-600">{a.resolvedChats}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-500 dark:text-slate-400">{a.messagesSent}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-500 dark:text-slate-400">{a.notes}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-14 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full" style={{ width: `${a.resolutionRate}%`, background: a.resolutionRate >= 70 ? '#10b981' : a.resolutionRate >= 40 ? '#f59e0b' : '#ef4444' }} />
                              </div>
                              <span className={`text-xs font-bold ${a.resolutionRate >= 70 ? 'text-emerald-600' : a.resolutionRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{a.resolutionRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">{a.chatsWithFrt > 0 ? <div className="flex flex-col"><span className={`text-sm font-bold ${frtColor(a.avgFrtMin)}`}>{fmtMin(a.avgFrtMin)}</span><span className="text-[10px] text-slate-400">{a.chatsWithFrt} chats</span></div> : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="px-4 py-3.5">{a.chatsWithFrt > 0 ? <span className={`text-sm font-bold ${frtColor(a.medianFrtMin)}`}>{fmtMin(a.medianFrtMin)}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="px-4 py-3.5">{a.resolvedChats > 0 ? <div className="flex flex-col"><span className={`text-sm font-bold ${rtColor(a.avgRtHours)}`}>{fmtHours(a.avgRtHours)}</span><span className="text-[10px] text-slate-400">{a.resolvedChats} resolved</span></div> : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="px-4 py-3.5">{a.resolvedChats > 0 ? <span className={`text-sm font-bold ${rtColor(a.medianRtHours)}`}>{fmtHours(a.medianRtHours)}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Top Performers ─────────────────────────────────────────────── */}
            {topAgents.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-5">Top Performers by Assigned Chats</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAgents} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} width={90} />
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="assignedChats" name="Assigned" radius={[0, 8, 8, 0]} maxBarSize={22}>
                        {topAgents.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Stats;
