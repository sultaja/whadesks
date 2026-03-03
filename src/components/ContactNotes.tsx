import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StickyNote, Plus, Loader2, Trash2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

interface ContactNotesProps {
  contactId: string;
}

export default function ContactNotes({ contactId }: ContactNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = async () => {
    try {
      // In a production app, you'd have a 'notes' table. 
      // For this demo, we'll simulate fetching from a table that should exist based on standard CRM patterns.
      const { data, error } = await supabase
        .from('messages') // Re-using messages table with a 'note' sender_type for demo simplicity
        .select('*')
        .eq('chat_id', contactId) // We'll assume the chat_id passed here is what we filter by
        .eq('sender_type', 'note')
        .order('created_at', { ascending: false });

      if (!error) setNotes(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [contactId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('messages').insert({
        chat_id: contactId,
        content: newNote,
        sender_type: 'note',
        sender_id: user.id
      });

      if (error) throw error;
      setNewNote('');
      showSuccess('Internal note added');
      fetchNotes();
    } catch (err) {
      showError('Failed to save note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote} className="relative">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add an internal note..."
          className="w-full p-3 pr-10 text-xs bg-amber-50 border border-amber-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none min-h-[80px] text-amber-900 placeholder:text-amber-400"
        />
        <button 
          disabled={submitting || !newNote.trim()}
          className="absolute bottom-2 right-2 p-1.5 bg-amber-200 text-amber-700 rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </form>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center p-4"><Loader2 size={20} className="animate-spin text-amber-200" /></div>
        ) : notes.length === 0 ? (
          <p className="text-[10px] text-center text-slate-400 py-4 italic">No internal notes for this contact</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="bg-amber-50/50 p-3 rounded-xl border border-amber-50 text-[11px] relative group">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center space-x-1 text-amber-600 font-bold">
                  <StickyNote size={10} />
                  <span>Agent Note</span>
                </div>
                <span className="text-[9px] text-amber-400">
                  {new Date(note.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">{note.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}