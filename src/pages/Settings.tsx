import React, { useState, useEffect, useCallback } from 'react';
import {
  User, Shield, Save, Loader2, Smartphone, Users, Plus, Trash2,
  ChevronDown, Mail, KeyRound, AlertTriangle, RefreshCw, Crown, UserCheck,
  Database, TriangleAlert,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/utils/toast';
import { WhatsAppAdminConnection } from '@/components/WhatsAppAdminConnection';

const WA_BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type Tab = 'profile' | 'whatsapp' | 'team' | 'data';

interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent', icon: UserCheck, color: 'text-blue-600 bg-blue-50' },
  { value: 'admin', label: 'Admin', icon: Crown, color: 'text-amber-600 bg-amber-50' },
];

function RoleBadge({ role }: { role: string }) {
  const opt = ROLE_OPTIONS.find(r => r.value === role) ?? ROLE_OPTIONS[0];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${opt.color}`}>
      <opt.icon size={11} />
      {opt.label}
    </span>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // ── Profile ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ first_name: '', last_name: '', role: 'agent' });

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('first_name, last_name, role').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) setProfile({ first_name: data.first_name || '', last_name: data.last_name || '', role: data.role || 'agent' });
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ first_name: profile.first_name, last_name: profile.last_name, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      showSuccess('Profile updated successfully!');
    } catch { showError('Failed to update profile'); }
    finally { setSaving(false); }
  };

  // ── Team ──────────────────────────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', first_name: '', last_name: '', password: '', role: 'agent' });
  const [isInviting, setIsInviting] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true);
    setTeamError(null);
    try {
      const resp = await fetch(`${WA_BACKEND}/api/team/members`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setTeamMembers(data.members || []);
    } catch (err: any) {
      setTeamError(err.message);
    } finally {
      setLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'team' && profile.role === 'admin') fetchTeam();
  }, [activeTab, profile.role, fetchTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.password) return;
    setIsInviting(true);
    try {
      const resp = await fetch(`${WA_BACKEND}/api/team/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      showSuccess(`${inviteForm.email} added to the team`);
      setInviteForm({ email: '', first_name: '', last_name: '', password: '', role: 'agent' });
      setShowInviteForm(false);
      fetchTeam();
    } catch (err: any) { showError(err.message); }
    finally { setIsInviting(false); }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setUpdatingRoleId(memberId);
    try {
      const resp = await fetch(`${WA_BACKEND}/api/team/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      showSuccess('Role updated');
    } catch (err: any) { showError(err.message); }
    finally { setUpdatingRoleId(null); }
  };

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Remove ${member.email} from the team? This action cannot be undone.`)) return;
    setDeletingId(member.id);
    try {
      const resp = await fetch(`${WA_BACKEND}/api/team/members/${member.id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setTeamMembers(prev => prev.filter(m => m.id !== member.id));
      showSuccess(`${member.email} removed`);
    } catch (err: any) { showError(err.message); }
    finally { setDeletingId(null); }
  };

  const isAdmin = profile.role === 'admin';

  // ── Clear storage ─────────────────────────────────────────────────────────
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearStorage = async () => {
    setClearing(true);
    try {
      const resp = await fetch(`${WA_BACKEND}/api/admin/clear-storage`, { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      showSuccess('Bütün məlumatlar silindi');
      setClearConfirm(false);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setClearing(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'whatsapp', label: 'WhatsApp Engine', icon: Smartphone, adminOnly: true },
    { id: 'team', label: 'Team Members', icon: Users, adminOnly: true },
    { id: 'data', label: 'Data Management', icon: Database, adminOnly: true },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5 shrink-0">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account and platform configuration</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-1">
          {TABS.filter(t => !t.adminOnly || isAdmin).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-6">

            {/* ── Profile Tab ────────────────────────────────────────────── */}
            {activeTab === 'profile' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600">
                    <User size={32} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Personal Information</h2>
                    <p className="text-sm text-slate-500">Update your display name and contact details.</p>
                  </div>
                </div>
                <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">First Name</label>
                      <input
                        type="text" value={profile.first_name}
                        onChange={e => setProfile({ ...profile, first_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-slate-100"
                        placeholder="Jane"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Last Name</label>
                      <input
                        type="text" value={profile.last_name}
                        onChange={e => setProfile({ ...profile, last_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-slate-100"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                    <input
                      type="email" value={user?.email || ''} disabled
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-400 mt-1.5">Email address cannot be changed here.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Role</label>
                    <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <Shield size={16} className="text-slate-400" />
                      <RoleBadge role={profile.role} />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button type="submit" disabled={saving}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 disabled:opacity-70">
                      {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── WhatsApp Engine Tab ─────────────────────────────────────── */}
            {activeTab === 'whatsapp' && isAdmin && (
              <WhatsAppAdminConnection />
            )}

            {/* ── Team Tab ──────────────────────────────────────────────── */}
            {activeTab === 'team' && isAdmin && (
              <div className="space-y-6">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Team Members</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Add agents and manage their roles.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={fetchTeam} disabled={loadingTeam}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <RefreshCw size={15} className={loadingTeam ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => setShowInviteForm(v => !v)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 transition-all">
                      <Plus size={15} />
                      Add Member
                    </button>
                  </div>
                </div>

                {/* Service role warning */}
                {teamError?.includes('SERVICE_ROLE') && (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-800 dark:text-amber-400">Service Role Key Required</p>
                      <p className="text-amber-700 dark:text-amber-500 mt-0.5">
                        Add <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
                        <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono text-xs">backend/.env</code> and restart the backend to enable team management.
                      </p>
                    </div>
                  </div>
                )}

                {/* Invite Form */}
                {showInviteForm && (
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-900/20">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Plus size={16} className="text-indigo-600" /> Add New Team Member
                      </h3>
                    </div>
                    <form onSubmit={handleInvite} className="p-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">First Name</label>
                          <input
                            type="text" placeholder="Jane"
                            value={inviteForm.first_name}
                            onChange={e => setInviteForm(p => ({ ...p, first_name: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Last Name</label>
                          <input
                            type="text" placeholder="Doe"
                            value={inviteForm.last_name}
                            onChange={e => setInviteForm(p => ({ ...p, last_name: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                          <Mail size={11} /> Email Address *
                        </label>
                        <input
                          type="email" placeholder="agent@company.com" required
                          value={inviteForm.email}
                          onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                          <KeyRound size={11} /> Temporary Password *
                        </label>
                        <input
                          type="password" placeholder="Min. 6 characters" required minLength={6}
                          value={inviteForm.password}
                          onChange={e => setInviteForm(p => ({ ...p, password: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm dark:text-slate-100"
                        />
                        <p className="text-xs text-slate-400 mt-1">Share this password with the team member so they can sign in.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Role</label>
                        <div className="flex gap-2">
                          {ROLE_OPTIONS.map(opt => (
                            <button
                              key={opt.value} type="button"
                              onClick={() => setInviteForm(p => ({ ...p, role: opt.value }))}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                inviteForm.role === opt.value
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              <opt.icon size={13} /> {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setShowInviteForm(false)}
                          className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          Cancel
                        </button>
                        <button type="submit" disabled={isInviting}
                          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200 transition-all disabled:opacity-70">
                          {isInviting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          Add Member
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Members List */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  {loadingTeam ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={28} className="animate-spin text-indigo-500" />
                    </div>
                  ) : teamMembers.length === 0 && !teamError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                      <Users size={36} className="opacity-30" />
                      <p className="text-sm">No team members yet. Add your first agent above.</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Member</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Email</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Role</th>
                          <th className="px-6 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {teamMembers.map(member => (
                          <tr key={member.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                  {(member.first_name || member.email).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {[member.first_name, member.last_name].filter(Boolean).join(' ') || '—'}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    Joined {new Date(member.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-slate-600 dark:text-slate-400">{member.email}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="relative group inline-block">
                                <select
                                  value={member.role}
                                  disabled={member.id === user?.id || updatingRoleId === member.id}
                                  onChange={e => handleUpdateRole(member.id, e.target.value)}
                                  className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {ROLE_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                                {updatingRoleId === member.id
                                  ? <Loader2 size={12} className="animate-spin absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
                                  : <ChevronDown size={12} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
                                }
                              </div>
                              {member.id === user?.id && (
                                <span className="ml-2 text-xs text-slate-400">(you)</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {member.id !== user?.id && (
                                <button
                                  onClick={() => handleDelete(member)}
                                  disabled={deletingId === member.id}
                                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                  title="Remove member"
                                >
                                  {deletingId === member.id
                                    ? <Loader2 size={15} className="animate-spin" />
                                    : <Trash2 size={15} />
                                  }
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── Data Management Tab ──────────────────────────────────────── */}
            {activeTab === 'data' && isAdmin && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Data Management</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Manage platform storage data. These actions cannot be undone.</p>
                </div>

                {/* Danger Zone card */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-red-100 dark:border-red-900/30 flex items-center gap-4 bg-red-50/50 dark:bg-red-900/10">
                    <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-500">
                      <TriangleAlert size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Danger Zone</h3>
                      <p className="text-sm text-red-500/80 dark:text-red-400/70">These actions permanently delete data from the platform database.</p>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-6 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 shrink-0 mt-0.5">
                          <Database size={18} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Clear All Storage</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            Deletes all <strong>messages</strong>, <strong>chats</strong> and <strong>contacts</strong> from the dashboard database.
                            Does <span className="underline">not</span> affect real WhatsApp messages.
                          </p>
                        </div>
                      </div>

                      {!clearConfirm ? (
                        <button
                          onClick={() => setClearConfirm(true)}
                          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 font-semibold text-sm transition-all"
                        >
                          <Trash2 size={15} />
                          Hamısını Sil
                        </button>
                      ) : (
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          <p className="text-xs font-bold text-red-600 dark:text-red-400 text-right">
                            Əminsiniz? Bu əməliyyat geri qaytarıla bilməz!
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setClearConfirm(false)}
                              disabled={clearing}
                              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-all"
                            >
                              Ləğv et
                            </button>
                            <button
                              onClick={handleClearStorage}
                              disabled={clearing}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all shadow-md shadow-red-200 disabled:opacity-70"
                            >
                              {clearing
                                ? <><Loader2 size={14} className="animate-spin" /> Silinir...</>
                                : <><Trash2 size={14} /> Bəli, Sil</>
                              }
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info box */}
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40">
                  <AlertTriangle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Qeyd:</strong> Bu əməliyyat yalnız platformanın Supabase bazasındakı məlumatları silir.
                    Həqiqi WhatsApp-dakı mesajlara, kontaktlara heç bir təsir etmir.
                    Team üzvləri, Quick Replies və profil məlumatları silinmir.
                  </p>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
