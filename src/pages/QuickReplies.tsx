import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Plus, Trash2, Edit2, Loader2, Search, X } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { useProfile } from '@/hooks/use-profile';

export default function QuickReplies() {
  const { isAdmin } = useProfile();
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    shortcut: '',
    title: '',
    content: ''
  });

  const fetchReplies = async () => {
    try {
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReplies(data || []);
    } catch (err) {
      showError('Failed to load quick replies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return showError("Only admins can manage the library");

    try {
      if (editingReply) {
        const { error } = await supabase
          .from('quick_replies')
          .update(formData)
          .eq('id', editingReply.id);
        if (error) throw error;
        showSuccess('Reply updated');
      } else {
        const { error } = await supabase
          .from('quick_replies')
          .insert([formData]);
        if (error) throw error;
        showSuccess('New reply added to library');
      }
      
      setIsModalOpen(false);
      setEditingReply(null);
      setFormData({ shortcut: '', title: '', content: '' });
      fetchReplies();
    } catch (err) {
      showError('Failed to save reply');
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !window.confirm('Delete this reply permanently?')) return;

    try {
      const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showSuccess('Reply removed');
      fetchReplies();
    } catch (err) {
      showError('Failed to delete');
    }
  };

  const openEdit = (reply: any) => {
    setEditingReply(reply);
    setFormData({
      shortcut: reply.shortcut,
      title: reply.title,
      content: reply.content
    });
    setIsModalOpen(true);
  };

  const filteredReplies = replies.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.shortcut.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Response Library</h1>
            <p className="text-slate-500 mt-1">Manage canned responses for the entire team</p>
          </div>
          {isAdmin && (
            <button 
              onClick={() => { setEditingReply(null); setFormData({shortcut:'', title:'', content:''}); setIsModalOpen(true); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-200 flex items-center space-x-2 font-bold transition-all transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              <span>Create New</span>
            </button>
          )}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search responses by title or shortcut..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReplies.map((reply) => (
            <div key={reply.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all relative">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                    <Zap size={20} fill="currentColor" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{reply.title}</h3>
                    <code className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded-md text-slate-500">
                      /{reply.shortcut}
                    </code>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex space-x-1">
                    <button onClick={() => openEdit(reply)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(reply.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-600 line-clamp-3 bg-slate-50 p-4 rounded-2xl italic border border-slate-100">
                "{reply.content}"
              </p>
            </div>
          ))}
        </div>

        {replies.length === 0 && (
          <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[3rem]">
            <Zap size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-800">Your library is empty</h3>
            <p className="text-slate-500 mt-2">Create standard answers to help your team reply faster.</p>
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-2xl font-extrabold text-slate-900">
                {editingReply ? 'Edit Response' : 'New Response'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Internal Title</label>
                <input 
                  type="text" 
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g., Welcome Message"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Slash Shortcut</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono">/</span>
                  <input 
                    type="text" 
                    required
                    value={formData.shortcut}
                    onChange={(e) => setFormData({...formData, shortcut: e.target.value})}
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                    placeholder="welcome"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Message Content</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="Hello! Thanks for reaching out..."
                />
              </div>
              <button 
                type="submit" 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-100"
              >
                {editingReply ? 'Update Response' : 'Add to Library'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}