import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import {
  Search, Send, Paperclip, Ban, CheckCircle, Clock, MessageSquarePlus,
  Loader2, ChevronDown, MessageSquare, Zap, UserPlus, Plus, X, Check,
  CheckCheck, MoreVertical, Trash2, ShieldAlert, ShieldCheck, Wifi, WifiOff,
  StickyNote, Users, RotateCcw, Smile, Music, Video, Download, FileText,
  Pin, PinOff, Image as ImageIcon,
  PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { showError, showSuccess } from '@/utils/toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const WA_BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WaChat {
  id: string;
  name: string;
  phone: string | null;   // resolved real phone (+XXXX), null for LID/group
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  lastMessage: string | null;
  isPinned: boolean;
}

interface WaMessage {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  author: string;
  type: string;
  hasMedia: boolean;
}

interface WaContact {
  id: string;
  name: string;
  number: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get the best phone string for a WaChat – prefer the backend-resolved phone. */
function chatPhone(chat: WaChat): string {
  if (chat.phone) return chat.phone;
  // fallback: only treat @c.us IDs as phone numbers
  if (chat.id.endsWith('@c.us')) return '+' + chat.id.split('@')[0];
  return chat.id.split('@')[0]; // group / LID – show as-is (no + prefix)
}

function fmtTs(ts: number): string {
  if (!ts) return '';
  try { return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ─── ContactAvatar ────────────────────────────────────────────────────────────

const picCache = new Map<string, string | null>();

function ContactAvatar({
  waId, name, size = 'md', blocked = false,
}: {
  waId: string; name: string; size?: 'sm' | 'md' | 'lg'; blocked?: boolean;
}) {
  const [pic, setPic] = useState<string | null | undefined>(
    picCache.has(waId) ? picCache.get(waId) : undefined
  );

  useEffect(() => {
    if (pic !== undefined) return; // already fetched or cached
    const encoded = encodeURIComponent(waId);
    fetch(`${WA_BACKEND}/api/profile-pic/${encoded}`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => { picCache.set(waId, d.url); setPic(d.url); })
      .catch(() => { picCache.set(waId, null); setPic(null); });
  }, [waId]);

  const sizeClass = size === 'sm' ? 'w-9 h-9 text-sm' : size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-10 h-10 text-sm';
  const initial = (name || '?').charAt(0).toUpperCase();

  if (pic) {
    return (
      <img
        src={pic}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shrink-0`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0 ${blocked ? 'bg-red-400 text-white' : 'bg-gradient-to-tr from-indigo-500 to-purple-500 text-white'}`}>
      {initial}
    </div>
  );
}

// ─── MediaMessage ─────────────────────────────────────────────────────────────

interface MediaState { mimetype: string; data: string; filename: string | null; }

function MediaMessage({ messageId, body, msgType, fromMe }: {
  messageId: string; body: string; msgType: string; fromMe: boolean;
}) {
  const [media, setMedia] = useState<MediaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${WA_BACKEND}/api/media/${encodeURIComponent(messageId)}`, { signal: AbortSignal.timeout(20000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { if (!cancelled) { setMedia(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [messageId]);

  const dimClass = fromMe ? 'text-indigo-200' : 'text-slate-400';

  if (loading) return (
    <div className={`flex items-center gap-2 text-[11px] ${dimClass}`}>
      <Loader2 size={12} className="animate-spin" /><span>Loading {msgType}…</span>
    </div>
  );

  if (failed || !media) {
    const icons: Record<string, React.ReactNode> = {
      image: <ImageIcon size={14} />, video: <Video size={14} />,
      audio: <Music size={14} />, ptt: <Music size={14} />,
      document: <FileText size={14} />, sticker: <span>🎭</span>,
    };
    return (
      <div className={`flex items-center gap-2 text-xs opacity-60 italic`}>
        {icons[msgType] ?? <FileText size={14} />}
        <span>[{msgType || 'Media'} – unavailable]</span>
      </div>
    );
  }

  const src = `data:${media.mimetype};base64,${media.data}`;
  const filename = media.filename || `file.${media.mimetype.split('/')[1]?.split(';')[0] || 'bin'}`;
  const sizeKB = Math.round((media.data.length * 0.75) / 1024);

  const content = (() => {
    if (media.mimetype.startsWith('image/')) return (
      <>
        <img src={src} alt={body || 'Image'} onClick={() => setLightbox(true)}
          className="max-w-[260px] max-h-[300px] rounded-xl object-cover cursor-zoom-in shadow-sm hover:opacity-90 transition-opacity" />
        {lightbox && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={() => setLightbox(false)}>
            <div className="relative max-w-[92vw] max-h-[92vh]">
              <img src={src} alt={filename} className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain" />
              <button onClick={() => setLightbox(false)} className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><X size={18} /></button>
              <a href={src} download={filename} onClick={e => e.stopPropagation()} className="absolute bottom-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><Download size={18} /></a>
            </div>
          </div>
        )}
      </>
    );
    if (media.mimetype.startsWith('video/')) return (
      <video controls src={src} className="max-w-[260px] max-h-[240px] rounded-xl shadow-sm" preload="metadata" />
    );
    if (media.mimetype.startsWith('audio/') || msgType === 'ptt') return (
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${fromMe ? 'bg-indigo-700/40' : 'bg-slate-100 dark:bg-slate-700'} w-[220px]`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${fromMe ? 'bg-indigo-400/40' : 'bg-indigo-100 dark:bg-indigo-900/40'}`}>
          <Music size={14} className={fromMe ? 'text-indigo-100' : 'text-indigo-600'} />
        </div>
        <audio controls src={src} className="flex-1 h-7 min-w-0" />
      </div>
    );
    return (
      <a href={src} download={filename}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors max-w-[240px] ${fromMe ? 'bg-indigo-700/30 border-indigo-500/30 hover:bg-indigo-700/50 text-indigo-100' : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${fromMe ? 'bg-indigo-600/50' : 'bg-indigo-50 dark:bg-indigo-900/30'}`}>
          <FileText size={18} className={fromMe ? 'text-indigo-200' : 'text-indigo-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{filename}</p>
          <p className={`text-[10px] mt-0.5 ${fromMe ? 'text-indigo-300' : 'text-slate-400'}`}>{sizeKB} KB</p>
        </div>
        <Download size={14} className="shrink-0 opacity-60" />
      </a>
    );
  })();

  return (
    <div className="flex flex-col gap-1.5">
      {content}
      {body && <p className="text-sm leading-relaxed whitespace-pre-wrap mt-0.5">{body}</p>}
    </div>
  );
}

// ─── Main Inbox Component ─────────────────────────────────────────────────────

export default function Inbox() {
  const { user } = useAuth();

  // Socket / WA
  const [socket, setSocket] = useState<Socket | null>(null);
  const [waReady, setWaReady] = useState(false);
  const [waChats, setWaChats] = useState<WaChat[]>([]);
  // messages keyed by chatId, always sorted ASC by timestamp, no duplicates
  const [waMessages, setWaMessages] = useState<Record<string, WaMessage[]>>({});
  // how many messages we've asked the backend to load for each chat
  const [loadedLimit, setLoadedLimit] = useState<Record<string, number>>({});
  // is the "load more" fetch in progress
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [waContacts, setWaContacts] = useState<WaContact[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [selectedChat, setSelectedChat] = useState<WaChat | null>(null);

  // Supabase CRM overlay
  const [sbContactMap, setSbContactMap] = useState<Record<string, any>>({});
  const [sbChatMap, setSbChatMap] = useState<Record<string, any>>({});
  const [activeSbContact, setActiveSbContact] = useState<any | null>(null);
  const [activeSbChat, setActiveSbChat] = useState<any | null>(null);

  // Agents, quick replies
  const [agents, setAgents] = useState<any[]>([]);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [replySearch, setReplySearch] = useState('');

  // Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [rightTab, setRightTab] = useState<'info' | 'notes'>('info');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSendingMedia, setIsSendingMedia] = useState(false);

  // New chat modal
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Socket.io ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const sock = io(WA_BACKEND);
    setSocket(sock);
    sock.on('connect', () => { });
    sock.on('disconnect', () => setWaReady(false));
    sock.on('ready', () => { setWaReady(true); sock.emit('fetch_contacts'); });
    sock.on('qr', () => setWaReady(false));
    sock.on('disconnected', () => setWaReady(false));
    sock.on('contacts', (list: WaContact[]) => setWaContacts(list));
    sock.on('chats', (list: WaChat[]) => {
      setWaChats(list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.timestamp - a.timestamp;
      }));
    });
    sock.on('chat_messages', (data: { chatId: string; messages: WaMessage[]; limit?: number }) => {
      setWaMessages(prev => ({
        ...prev,
        [data.chatId]: mergeAndSortMessages(prev[data.chatId] || [], data.messages),
      }));
      if (data.limit) {
        setLoadedLimit(prev => ({ ...prev, [data.chatId]: data.limit as number }));
      }
      setIsLoadingMore(false);
      scrollToBottom(true);
    });
    sock.on('new_message', (data: { chatId: string; message: WaMessage }) => {
      setWaMessages(prev => {
        const existing = prev[data.chatId] || [];
        if (existing.some(m => m.id === data.message.id)) return prev;
        return { ...prev, [data.chatId]: mergeAndSortMessages(existing, [data.message]) };
      });
      setWaChats(prev =>
        prev.map(c => c.id === data.chatId
          ? { ...c, lastMessage: data.message.body || (data.message.hasMedia ? '[Media]' : ''), timestamp: data.message.timestamp, unreadCount: data.message.fromMe ? c.unreadCount : c.unreadCount + 1 }
          : c
        ).sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.timestamp - a.timestamp;
        })
      );
      // Only auto-scroll if user was already at the bottom
      scrollToBottom(false);
    });
    return () => { sock.disconnect(); };
  }, []);

  // ── Supabase CRM ───────────────────────────────────────────────────────────

  const loadSupabaseCrm = useCallback(async () => {
    const [{ data: contacts }, { data: chats }] = await Promise.all([
      supabase.from('contacts').select('id, phone_number, name, is_blocked'),
      supabase.from('chats').select('id, status, assigned_to, unread_count, contact_id, updated_at, profiles(id, first_name, last_name)'),
    ]);
    const cMap: Record<string, any> = {};
    contacts?.forEach(c => { cMap[c.phone_number] = c; });
    setSbContactMap(cMap);
    const chMap: Record<string, any> = {};
    chats?.forEach(c => { chMap[c.contact_id] = c; });
    setSbChatMap(chMap);
  }, []);

  useEffect(() => {
    loadSupabaseCrm();
    supabase.from('profiles').select('id, first_name, last_name').then(({ data }) => { if (data) setAgents(data); });
    supabase.from('quick_replies').select('*').then(({ data }) => { if (data) setQuickReplies(data); });
    const channel = supabase.channel('crm-sync-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, loadSupabaseCrm)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, loadSupabaseCrm)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSupabaseCrm]);

  // ── Load CRM when chat selected ────────────────────────────────────────────

  useEffect(() => {
    if (!selectedChat || !socket) return;
    // Always fetch fresh messages on chat open; reset limit to initial 50
    setLoadedLimit(prev => ({ ...prev, [selectedChat.id]: 50 }));
    socket.emit('fetch_messages', { chatId: selectedChat.id, limit: 50 });
    loadCrmForChat(selectedChat);
    setWaChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, unreadCount: 0 } : c));
  }, [selectedChat?.id, socket]);

  const loadCrmForChat = async (waChat: WaChat) => {
    setLoadingCrm(true);
    const phone = chatPhone(waChat);
    const { data: contact } = await supabase.from('contacts')
      .upsert({ phone_number: phone, name: waChat.name || phone }, { onConflict: 'phone_number', ignoreDuplicates: false })
      .select().single();
    if (!contact) { setLoadingCrm(false); return; }
    let { data: chat } = await supabase.from('chats')
      .select('*, profiles(id, first_name, last_name)')
      .eq('contact_id', contact.id).in('status', ['open', 'snoozed'])
      .order('updated_at', { ascending: false }).limit(1).single();
    if (!chat) {
      const { data: nc } = await supabase.from('chats')
        .insert({ contact_id: contact.id, status: 'open', unread_count: 0 })
        .select('*, profiles(id, first_name, last_name)').single();
      chat = nc;
    }
    setActiveSbContact(contact);
    setActiveSbChat(chat);
    setSbContactMap(prev => ({ ...prev, [phone]: contact }));
    if (contact && chat) setSbChatMap(prev => ({ ...prev, [contact.id]: chat }));
    if (chat) fetchNotes(chat.id);
    setLoadingCrm(false);
  };

  // ── Notes ──────────────────────────────────────────────────────────────────

  const fetchNotes = async (chatId: string) => {
    setLoadingNotes(true);
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chatId).eq('sender_type', 'note').order('created_at', { ascending: false });
    setNotes(data || []);
    setLoadingNotes(false);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !user || !activeSbChat) return;
    setSubmittingNote(true);
    try {
      const { error } = await supabase.from('messages').insert({ chat_id: activeSbChat.id, content: newNote, sender_type: 'note', sender_id: user.id });
      if (error) throw error;
      setNewNote(''); showSuccess('Note added'); fetchNotes(activeSbChat.id);
    } catch { showError('Failed to save note'); }
    finally { setSubmittingNote(false); }
  };

  // Merge two message arrays, dedup by id, sort ASC by timestamp
  function mergeAndSortMessages(a: WaMessage[], b: WaMessage[]): WaMessage[] {
    const map = new Map<string, WaMessage>();
    [...a, ...b].forEach(m => map.set(m.id, m));
    return Array.from(map.values()).sort((x, y) => x.timestamp - y.timestamp);
  }

  function isNearBottom(): boolean {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // force=true → always scroll (initial load), force=false → only if already at bottom
  const scrollToBottom = (force = false) => {
    setTimeout(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      if (force || isNearBottom()) {
        el.scrollTop = el.scrollHeight;
      }
    }, 80);
  };

  // Load 50 more older messages by increasing the limit
  const loadMoreMessages = useCallback(() => {
    if (!selectedChat || !socket || isLoadingMore) return;
    const currentLimit = loadedLimit[selectedChat.id] || 50;
    const newLimit = currentLimit + 50;
    // Save scroll height so we can restore position after new messages prepend
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    setIsLoadingMore(true);
    socket.emit('fetch_messages', { chatId: selectedChat.id, limit: newLimit });
    // After messages update, restore the scroll position
    setTimeout(() => {
      if (container) {
        container.scrollTop = container.scrollHeight - prevScrollHeight;
      }
    }, 300);
  }, [selectedChat, socket, isLoadingMore, loadedLimit]);

  // ── Close emoji picker outside click ──────────────────────────────────────

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? newMessage.length;
      const end = ta.selectionEnd ?? newMessage.length;
      const next = newMessage.slice(0, start) + emojiData.emoji + newMessage.slice(end);
      setNewMessage(next);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length); }, 0);
    } else {
      setNewMessage(prev => prev + emojiData.emoji);
    }
  };

  // ── File send ──────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat || !activeSbContact) return;
    if (e.target) e.target.value = '';
    setIsSendingMedia(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const resp = await fetch(`${WA_BACKEND}/api/send-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: activeSbContact.phone_number, mimetype: file.type || 'application/octet-stream', data: base64, filename: file.name }),
          signal: AbortSignal.timeout(30000),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error);
        showSuccess(`${file.name} sent`);
      };
      reader.onerror = () => { throw new Error('File read error'); };
      reader.readAsDataURL(file);
    } catch (err: any) { showError(err?.message || 'Failed to send file'); }
    finally { setIsSendingMedia(false); }
  };

  // ── Send text message ──────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !socket || activeSbContact?.is_blocked) return;
    const text = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    try {
      socket.emit('send_message', { chatId: selectedChat.id, message: text });
      if (activeSbChat) {
        await supabase.from('messages').insert({ chat_id: activeSbChat.id, content: text, sender_type: 'agent', sender_id: user?.id });
        await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', activeSbChat.id);
      }
    } catch { showError('Failed to send message'); setNewMessage(text); }
    finally { setIsSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    if (val.startsWith('/')) {
      const match = quickReplies.find(r => r.shortcut.toLowerCase() === val.slice(1).toLowerCase());
      if (match) { setNewMessage(match.content); showSuccess(`Applied /${match.shortcut}`); }
    }
  };

  // ── CRM Actions ────────────────────────────────────────────────────────────

  const toggleBlock = async () => {
    if (!activeSbContact || !selectedChat) return;
    setIsBlocking(true);
    const newState = !activeSbContact.is_blocked;
    try {
      // 1. Update Supabase
      const { error } = await supabase.from('contacts').update({ is_blocked: newState }).eq('id', activeSbContact.id);
      if (error) throw error;
      // 2. Block/unblock via WhatsApp API
      if (waReady) {
        const endpoint = newState ? 'block' : 'unblock';
        await fetch(`${WA_BACKEND}/api/${endpoint}/${encodeURIComponent(selectedChat.id)}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => {});
      }
      const updated = { ...activeSbContact, is_blocked: newState };
      setActiveSbContact(updated);
      setSbContactMap(prev => ({ ...prev, [activeSbContact.phone_number]: updated }));
      showSuccess(newState ? 'Contact blocked' : 'Contact unblocked');
    } catch { showError('Failed to update block status'); }
    finally { setIsBlocking(false); }
  };

  const togglePin = async () => {
    if (!selectedChat) return;
    setIsPinning(true);
    const newPinned = !selectedChat.isPinned;
    try {
      const endpoint = newPinned ? 'pin-chat' : 'unpin-chat';
      const resp = await fetch(`${WA_BACKEND}/api/${endpoint}/${encodeURIComponent(selectedChat.id)}`, { method: 'POST', signal: AbortSignal.timeout(8000) });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);
      setWaChats(prev =>
        prev.map(c => c.id === selectedChat.id ? { ...c, isPinned: newPinned } : c)
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return b.timestamp - a.timestamp;
          })
      );
      setSelectedChat(prev => prev ? { ...prev, isPinned: newPinned } : prev);
      showSuccess(newPinned ? 'Chat pinned' : 'Chat unpinned');
    } catch (err: any) { showError(err?.message || 'Failed to update pin'); }
    finally { setIsPinning(false); }
  };

  const updateChatStatus = async (status: string) => {
    if (!activeSbChat) return;
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase.from('chats').update({ status, updated_at: new Date().toISOString() }).eq('id', activeSbChat.id);
      if (error) throw error;
      const updated = { ...activeSbChat, status };
      setActiveSbChat(updated);
      if (activeSbContact) setSbChatMap(prev => ({ ...prev, [activeSbContact.id]: updated }));
      showSuccess(`Marked as ${status}`);
      if (status === 'resolved') { setSelectedChat(null); setActiveSbContact(null); setActiveSbChat(null); }
    } catch { showError('Failed to update status'); }
    finally { setIsUpdatingStatus(false); }
  };

  const assignAgent = async (agentId: string) => {
    if (!activeSbChat) return;
    setIsAssigning(true);
    try {
      const { error } = await supabase.from('chats').update({ assigned_to: agentId }).eq('id', activeSbChat.id);
      if (error) throw error;
      const agent = agents.find(a => a.id === agentId);
      const updated = { ...activeSbChat, assigned_to: agentId, profiles: agent };
      setActiveSbChat(updated);
      if (activeSbContact) setSbChatMap(prev => ({ ...prev, [activeSbContact.id]: updated }));
      showSuccess('Agent assigned');
    } catch { showError('Assignment failed'); }
    finally { setIsAssigning(false); }
  };

  const clearHistory = async () => {
    if (!activeSbChat || !window.confirm('Clear chat history? This cannot be undone.')) return;
    try {
      await supabase.from('messages').delete().eq('chat_id', activeSbChat.id).neq('sender_type', 'note');
      setWaMessages(prev => { const n = { ...prev }; delete n[selectedChat!.id]; return n; });
      if (socket && selectedChat) socket.emit('fetch_messages', selectedChat.id);
      showSuccess('History cleared');
    } catch { showError('Failed to clear history'); }
  };

  const handleContactSelect = (contact: WaContact) => {
    const existing = waChats.find(c => c.id === contact.id);
    const chat: WaChat = existing || { id: contact.id, name: contact.name, isGroup: false, unreadCount: 0, timestamp: Date.now() / 1000, lastMessage: null, isPinned: false };
    if (!existing) setWaChats(prev => [chat, ...prev]);
    setSelectedChat(chat); setShowContacts(false);
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) return;
    setIsCreatingChat(true);
    try {
      const phone = newChatPhone.trim().startsWith('+') ? newChatPhone.trim() : '+' + newChatPhone.trim();
      const waId = phone.replace(/^\+/, '') + '@c.us';
      const fakeChat: WaChat = { id: waId, name: newChatName || phone, isGroup: false, unreadCount: 0, timestamp: Date.now() / 1000, lastMessage: null, isPinned: false };
      setWaChats(prev => [fakeChat, ...prev.filter(c => c.id !== waId)]);
      setSelectedChat(fakeChat);
      setIsNewChatModalOpen(false); setNewChatPhone(''); setNewChatName('');
      showSuccess('Conversation started');
    } catch { showError('Failed to start conversation'); }
    finally { setIsCreatingChat(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredChats = waChats.filter(chat => {
    if (chat.isGroup) return false;
    const phone = chatPhone(chat);
    const sbContact = sbContactMap[phone];
    const sbChat = sbContact ? sbChatMap[sbContact.id] : null;
    if (sbChat?.status === 'resolved') return false;
    const term = searchQuery.toLowerCase();
    if (term && !chat.name?.toLowerCase().includes(term) && !phone.includes(term)) return false;
    if (inboxFilter === 'mine') return sbChat?.assigned_to === user?.id;
    if (inboxFilter === 'unassigned') return !sbChat?.assigned_to;
    return true;
  });

  const filteredReplies = quickReplies.filter(r =>
    r.title.toLowerCase().includes(replySearch.toLowerCase()) ||
    r.shortcut.toLowerCase().includes(replySearch.toLowerCase())
  );

  const currentMessages = selectedChat ? waMessages[selectedChat.id] || [] : [];
  const isBlocked = activeSbContact?.is_blocked === true;
  const chatStatus = activeSbChat?.status;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full bg-white dark:bg-slate-950 rounded-l-3xl shadow-sm overflow-hidden border-y border-l border-slate-200 dark:border-slate-800 my-2">

      {/* ── LEFT: Chat List ────────────────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 transition-all duration-300 ease-in-out ${leftPanelOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-r-0 overflow-hidden'}`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Inbox</h2>
            {waReady
              ? <span className="flex items-center space-x-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800"><Wifi size={9} /><span>Live</span></span>
              : <span className="flex items-center space-x-1 text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800"><WifiOff size={9} /><span>Offline</span></span>
            }
          </div>
          <div className="flex items-center space-x-1">
            <button onClick={() => setShowContacts(!showContacts)} title="Browse WA contacts"
              className={`p-2 rounded-xl transition-colors ${showContacts ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <Users size={16} />
            </button>
            <button onClick={() => setIsNewChatModalOpen(true)} title="New conversation"
              className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
              <MessageSquarePlus size={16} />
            </button>
            {/* Left panel collapse */}
            <button onClick={() => setLeftPanelOpen(false)} title="Hide chat list"
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all">
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
            {(['all', 'mine', 'unassigned'] as const).map(f => (
              <button key={f} onClick={() => setInboxFilter(f)}
                className={`flex-1 text-[9px] font-bold px-1 py-1.5 rounded-lg capitalize transition-all ${inboxFilter === f ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" />
          </div>
        </div>

        {/* Contact picker */}
        {showContacts ? (
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            <p className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">WhatsApp Contacts</p>
            {waContacts.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-slate-400 text-xs space-y-2"><Loader2 className="animate-spin" size={20} /><span>Loading…</span></div>
            ) : waContacts.map(c => (
              <button key={c.id} onClick={() => handleContactSelect(c)}
                className="flex w-full items-center space-x-3 p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                <ContactAvatar waId={c.id} name={c.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-400">{c.number}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* Chat list */
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 mt-1">
            {filteredChats.map(chat => {
              const phone = chatPhone(chat);
              const sbContact = sbContactMap[phone];
              const sbChat = sbContact ? sbChatMap[sbContact.id] : null;
              const blocked = sbContact?.is_blocked;
              const assigned = sbChat?.profiles?.first_name;

              return (
                <button key={chat.id} onClick={() => { setSelectedChat(chat); setRightTab('info'); }}
                  className={`w-full text-left p-3 rounded-2xl transition-all ${selectedChat?.id === chat.id ? 'bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900 shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'}`}>
                  <div className="flex items-center space-x-3">
                    <div className="relative shrink-0">
                      <ContactAvatar waId={chat.id} name={chat.name} size="md" blocked={blocked} />
                      {chat.isPinned && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-white rounded-full flex items-center justify-center text-[8px] font-black">★</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold text-sm truncate max-w-[110px] ${selectedChat?.id === chat.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                          {chat.isPinned && <span className="text-amber-500 mr-0.5">*</span>}
                          {chat.name || phone}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">{fmtTs(chat.timestamp)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                          {chat.lastMessage || (assigned ? `Agent: ${assigned}` : 'No messages yet')}
                        </span>
                        {chat.unreadCount > 0 && (
                          <span className="bg-indigo-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">{chat.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {waReady && filteredChats.length === 0 && <div className="text-center py-10 text-slate-400 text-xs italic">No conversations found</div>}
            {!waReady && filteredChats.length === 0 && (
              <div className="flex flex-col items-center py-12 space-y-3 text-slate-400">
                <WifiOff size={28} className="opacity-30" />
                <p className="text-xs text-center">WhatsApp offline.<br />Connect in Settings.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CENTER: Message Thread ─────────────────────────────────────────── */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 min-w-0">
          {/* Header */}
          <div className="h-16 border-b border-slate-100 dark:border-slate-800 px-5 flex items-center justify-between bg-white dark:bg-slate-950 shadow-sm z-10 shrink-0">
            <div className="flex items-center space-x-3 min-w-0">
              {/* Restore left panel when hidden */}
              {!leftPanelOpen && (
                <button onClick={() => setLeftPanelOpen(true)} title="Show chat list"
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all shrink-0">
                  <PanelLeftOpen size={18} />
                </button>
              )}
              <ContactAvatar waId={selectedChat.id} name={selectedChat.name} size="md" blocked={isBlocked} />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  {selectedChat.isPinned && <span className="text-amber-400 text-sm">★</span>}
                  <h2 className="font-bold text-slate-800 dark:text-white truncate leading-tight">{selectedChat.name || chatPhone(selectedChat)}</h2>
                  {isBlocked && <span className="text-[8px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Blocked</span>}
                  {chatStatus === 'resolved' && <span className="text-[8px] font-black bg-green-100 text-green-600 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Resolved</span>}
                  {chatStatus === 'snoozed' && <span className="text-[8px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Snoozed</span>}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-slate-400">{chatPhone(selectedChat)}</span>
                  {loadingCrm && <Loader2 size={10} className="animate-spin text-slate-300" />}
                  {!loadingCrm && activeSbChat?.profiles?.first_name && (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center space-x-0.5">
                      <UserPlus size={9} /><span>{activeSbChat.profiles.first_name}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              {activeSbChat && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center space-x-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-100 transition-colors">
                    {isAssigning ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    <span className="hidden sm:inline ml-1">Assign</span>
                    <ChevronDown size={10} className="ml-0.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48 rounded-xl border-slate-100 dark:border-slate-800 shadow-xl dark:bg-slate-900">
                    <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Assign to…</p>
                    {agents.map(agent => (
                      <DropdownMenuItem key={agent.id} onClick={() => assignAgent(agent.id)} className="px-3 py-2.5 flex items-center space-x-2 cursor-pointer dark:hover:bg-slate-800">
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold dark:text-white">{agent.first_name?.charAt(0)}</div>
                        <span className="text-sm font-medium dark:text-white">{agent.first_name} {agent.last_name}</span>
                        {activeSbChat?.assigned_to === agent.id && <Check size={12} className="text-indigo-600 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all">
                  <MoreVertical size={18} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl border-slate-200 dark:border-slate-800 shadow-xl dark:bg-slate-900">
                  {/* Pin / Unpin */}
                  <DropdownMenuItem onClick={togglePin} className="flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 text-amber-600">
                    {isPinning ? <Loader2 size={16} className="animate-spin" /> : selectedChat.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    <span className="text-sm font-medium">{selectedChat.isPinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                  </DropdownMenuItem>
                  {/* Resolve / Reopen */}
                  {chatStatus !== 'resolved' ? (
                    <DropdownMenuItem onClick={() => updateChatStatus('resolved')} className="flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 text-emerald-600">
                      <CheckCircle size={16} /><span className="text-sm font-medium">Mark Resolved</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => updateChatStatus('open')} className="flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 text-indigo-600">
                      <RotateCcw size={16} /><span className="text-sm font-medium">Reopen</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => updateChatStatus('snoozed')} className="flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 text-amber-600">
                    <Clock size={16} /><span className="text-sm font-medium">Snooze</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleBlock} className={`flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 ${isBlocked ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isBlocked ? <ShieldCheck size={16} /> : <Ban size={16} />}
                    <span className="text-sm font-medium">{isBlocked ? 'Unblock Contact' : 'Block Contact'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={clearHistory} className="flex items-center space-x-2 p-3 cursor-pointer dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Trash2 size={16} /><span className="text-sm font-medium">Clear History</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Right panel toggle */}
              <button
                onClick={() => setRightPanelOpen(v => !v)}
                title={rightPanelOpen ? 'Hide info panel' : 'Show info panel'}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
              >
                {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40 dark:bg-slate-900/20 flex flex-col"
          >
            {currentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
                <MessageSquare size={36} className="opacity-20" />
                <p className="text-sm italic">No messages yet</p>
              </div>
            ) : (
              <>
                {/* Load More */}
                <div className="flex justify-center">
                  {isLoadingMore ? (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400 py-2">
                      <Loader2 size={13} className="animate-spin" /> Loading older messages…
                    </span>
                  ) : (
                    <button
                      onClick={loadMoreMessages}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline py-1 px-3 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      ↑ Load older messages
                    </button>
                  )}
                </div>

                {currentMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] flex flex-col ${msg.fromMe ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${msg.fromMe
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'}`}>
                        {msg.hasMedia
                          ? <MediaMessage messageId={msg.id} body={msg.body} msgType={msg.type} fromMe={msg.fromMe} />
                          : <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.body}</p>
                        }
                      </div>
                      <div className={`flex items-center space-x-1 text-[9px] mt-0.5 ${msg.fromMe ? 'text-slate-400 justify-end' : 'text-slate-400'}`}>
                        <span>{fmtTs(msg.timestamp)}</span>
                        {msg.fromMe && <CheckCheck size={11} className="text-indigo-400" />}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {isBlocked ? (
            <div className="p-5 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30 flex flex-col items-center text-center space-y-2 shrink-0">
              <ShieldAlert className="text-red-500" size={22} />
              <p className="text-sm font-bold text-red-800 dark:text-red-400">This contact is blocked</p>
              <p className="text-xs text-red-500/70">You cannot send messages until this contact is unblocked.</p>
              <button onClick={toggleBlock} disabled={isBlocking} className="mt-1 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors">
                {isBlocking ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Unblock Now'}
              </button>
            </div>
          ) : (
            <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 shrink-0">
              {/* Toolbar row */}
              <div className="flex items-center space-x-2 mb-2">
                {/* Quick Replies */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-full hover:bg-indigo-100 transition-colors uppercase">
                    <Zap size={11} /><span>Quick Replies</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-72 rounded-xl border-slate-200 dark:border-slate-800 shadow-xl max-h-72 overflow-hidden flex flex-col dark:bg-slate-900">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                        <input type="text" placeholder="Search replies…" value={replySearch} onChange={e => setReplySearch(e.target.value)}
                          className="w-full pl-6 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-[10px] focus:ring-1 focus:ring-indigo-500 outline-none dark:text-white border-none" />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredReplies.map(r => (
                        <DropdownMenuItem key={r.id} onClick={() => setNewMessage(r.content)} className="flex flex-col items-start p-3 cursor-pointer dark:hover:bg-slate-800">
                          <div className="flex items-center justify-between w-full">
                            <span className="font-bold text-slate-800 dark:text-white text-xs">{r.title}</span>
                            <span className="text-[8px] font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500">/{r.shortcut}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate w-full mt-0.5">{r.content}</span>
                        </DropdownMenuItem>
                      ))}
                      {filteredReplies.length === 0 && <p className="p-4 text-center text-[10px] text-slate-400 italic">No matches</p>}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* File attachment */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSendingMedia || !activeSbContact}
                  title="Send file / image"
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-40"
                >
                  {isSendingMedia ? <Loader2 size={16} className="animate-spin text-indigo-500" /> : <Paperclip size={16} />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Text input row */}
              <div className="relative">
                {/* Emoji picker popup */}
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-2 z-50 shadow-2xl rounded-2xl overflow-hidden">
                    <EmojiPicker onEmojiClick={onEmojiClick} height={380} width={320} searchDisabled={false} skinTonesDisabled lazyLoadEmojis />
                  </div>
                )}

                <div className="flex items-end space-x-2 bg-slate-50 dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 transition-all shadow-sm">
                  {/* Emoji button */}
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(p => !p)}
                    className={`p-2 rounded-lg transition-colors shrink-0 ${showEmojiPicker ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <Smile size={18} />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={newMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message or /shortcut…"
                    className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none py-3 px-1 focus:outline-none text-sm text-slate-800 dark:text-white"
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isSending || !newMessage.trim()}
                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 shrink-0"
                  >
                    {isSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/20 text-slate-400 space-y-4">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center"><MessageSquare size={32} /></div>
          <p className="font-medium">Select a conversation to start chatting</p>
          {!waReady && <p className="text-xs text-amber-500">WhatsApp engine is offline — go to Settings to connect.</p>}
        </div>
      )}

      {/* ── RIGHT: CRM Panel ───────────────────────────────────────────────── */}
      {selectedChat && (
        <div className={`bg-slate-50/50 dark:bg-slate-900/50 border-l border-slate-100 dark:border-slate-800 flex flex-col shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${rightPanelOpen ? 'w-72 opacity-100' : 'w-0 opacity-0 border-l-0'}`}>
          <div className="flex border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
            <button onClick={() => setRightTab('info')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all ${rightTab === 'info' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-400 hover:text-slate-600'}`}>Info</button>
            <button onClick={() => setRightTab('notes')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all ${rightTab === 'notes' ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400' : 'text-slate-400 hover:text-slate-600'}`}>Notes</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'info' ? (
              <div className="p-5 space-y-6">
                {/* Contact card with real profile pic */}
                <div className="flex flex-col items-center text-center pt-2">
                  <ContactAvatar waId={selectedChat.id} name={selectedChat.name} size="lg" blocked={isBlocked} />
                  <h2 className="text-base font-bold text-slate-800 dark:text-white mt-3">{selectedChat.name || 'Unknown'}</h2>
                  <p className="text-slate-500 text-xs font-mono mt-0.5">{chatPhone(selectedChat)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {isBlocked && <span className="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase tracking-widest">Blocked</span>}
                    {selectedChat.isPinned && <span className="text-[9px] font-black bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-0.5"><Pin size={9} />Pinned</span>}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</h3>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${chatStatus === 'resolved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : chatStatus === 'snoozed' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                    {chatStatus || 'open'}
                  </span>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {chatStatus !== 'resolved' ? (
                      <button onClick={() => updateChatStatus('resolved')} disabled={isUpdatingStatus}
                        className="flex flex-col items-center py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:border-green-500 hover:text-green-600 transition-all shadow-sm dark:text-white text-slate-600">
                        <CheckCircle size={18} /><span className="text-[9px] font-bold uppercase mt-1">Resolve</span>
                      </button>
                    ) : (
                      <button onClick={() => updateChatStatus('open')} disabled={isUpdatingStatus}
                        className="flex flex-col items-center py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm dark:text-white text-slate-600">
                        <RotateCcw size={18} /><span className="text-[9px] font-bold uppercase mt-1">Reopen</span>
                      </button>
                    )}
                    <button onClick={() => updateChatStatus('snoozed')} disabled={isUpdatingStatus}
                      className="flex flex-col items-center py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:border-orange-500 hover:text-orange-600 transition-all shadow-sm dark:text-white text-slate-600">
                      <Clock size={18} /><span className="text-[9px] font-bold uppercase mt-1">Snooze</span>
                    </button>
                    <button onClick={toggleBlock} disabled={isBlocking}
                      className={`flex flex-col items-center py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 transition-all shadow-sm dark:text-white ${isBlocked ? 'hover:border-emerald-500 hover:text-emerald-600 text-red-500' : 'hover:border-red-500 hover:text-red-600 text-slate-600'}`}>
                      {isBlocking ? <Loader2 size={18} className="animate-spin" /> : isBlocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
                      <span className="text-[9px] font-bold uppercase mt-1">{isBlocked ? 'Unblock' : 'Block'}</span>
                    </button>
                    <button onClick={togglePin} disabled={isPinning}
                      className={`flex flex-col items-center py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 transition-all shadow-sm ${selectedChat.isPinned ? 'text-amber-500 hover:border-amber-400' : 'text-slate-600 dark:text-white hover:border-amber-400 hover:text-amber-500'}`}>
                      {isPinning ? <Loader2 size={18} className="animate-spin" /> : selectedChat.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                      <span className="text-[9px] font-bold uppercase mt-1">{selectedChat.isPinned ? 'Unpin' : 'Pin'}</span>
                    </button>
                  </div>
                </div>

                {/* Assign agent */}
                {activeSbChat && (
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assigned Agent</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center space-x-2">
                          {isAssigning ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} className="text-slate-400" />}
                          <span>{activeSbChat?.profiles?.first_name ? `${activeSbChat.profiles.first_name} ${activeSbChat.profiles.last_name || ''}`.trim() : 'Unassigned'}</span>
                        </div>
                        <ChevronDown size={12} className="text-slate-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56 rounded-xl border-slate-200 dark:border-slate-800 shadow-xl dark:bg-slate-900">
                        <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Assign to…</p>
                        {agents.map(agent => (
                          <DropdownMenuItem key={agent.id} onClick={() => assignAgent(agent.id)} className="px-3 py-2.5 flex items-center space-x-2 cursor-pointer dark:hover:bg-slate-800">
                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold dark:text-white">{agent.first_name?.charAt(0)}</div>
                            <span className="text-sm font-medium dark:text-white">{agent.first_name} {agent.last_name}</span>
                            {activeSbChat?.assigned_to === agent.id && <Check size={12} className="text-indigo-600 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ) : (
              /* Notes tab */
              <div className="p-5 space-y-4">
                <form onSubmit={handleAddNote} className="relative">
                  <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add an internal note…"
                    className="w-full p-3 pr-10 text-xs bg-amber-50 border border-amber-100 dark:bg-amber-900/10 dark:border-amber-800/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none min-h-[80px] text-amber-900 dark:text-amber-200 placeholder:text-amber-400" />
                  <button disabled={submittingNote || !newNote.trim()}
                    className="absolute bottom-2 right-2 p-1.5 bg-amber-200 dark:bg-amber-700 text-amber-700 dark:text-amber-100 rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-50">
                    {submittingNote ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  </button>
                </form>
                <div className="space-y-3">
                  {loadingNotes ? <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-amber-300" /></div>
                    : notes.length === 0 ? <p className="text-[10px] text-center text-slate-400 py-4 italic">No internal notes yet</p>
                      : notes.map(note => (
                        <div key={note.id} className="bg-amber-50/60 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-100 dark:border-amber-800/20 text-[11px]">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-1 text-amber-600 font-bold"><StickyNote size={10} /><span>Note</span></div>
                            <span className="text-[9px] text-amber-400">{new Date(note.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{note.content}</p>
                        </div>
                      ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── New Chat Modal ─────────────────────────────────────────────────── */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="p-7 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">New Conversation</h2>
              <button onClick={() => setIsNewChatModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={22} /></button>
            </div>
            <form onSubmit={handleCreateChat} className="p-7 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                <input type="tel" required value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none font-mono dark:text-white text-sm"
                  placeholder="+994501234567" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Name (Optional)</label>
                <input type="text" value={newChatName} onChange={e => setNewChatName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
                  placeholder="Customer name" />
              </div>
              <button type="submit" disabled={isCreatingChat || !newChatPhone.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg flex items-center justify-center space-x-2 disabled:opacity-60">
                {isCreatingChat ? <Loader2 className="animate-spin" size={18} /> : <MessageSquarePlus size={18} />}
                <span>Start Chatting</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
