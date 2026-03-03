import React, { useState, useEffect, useRef } from 'react';
import { Search, Send, Paperclip, Ban, CheckCircle, Clock, UserCheck, MessageSquarePlus, Loader2, ChevronDown, StickyNote, MessageSquare, Zap, RefreshCcw, UserPlus, Image as ImageIcon, File as FileIcon, Tag, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/utils/toast';
import ContactNotes from '@/components/ContactNotes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Inbox() {
  const { user } = useAuth();
  
  const [chats, setChats] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [rightTab, setRightTab] = useState<'info' | 'notes'>('info');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'mine'>('mine');
  
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  
  // New Chat Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchChats = async () => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          id, status, unread_count, updated_at, assigned_to,
          contacts (id, name, phone_number, is_blocked),
          profiles (id, first_name, last_name)
        `)
        .neq('status', 'resolved')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setChats(data || []);
      
      if (data && data.length > 0 && !activeChat) {
        const initial = inboxFilter === 'mine' 
          ? data.find(c => c.assigned_to === user?.id) || data[0]
          : data[0];
        setActiveChat(initial);
      }
    } catch (error: any) {
      console.error('Error fetching chats:', error);
      showError('Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchAgents = async () => {
    const { data } = await supabase.from('profiles').select('id, first_name, last_name');
    if (data) setAgents(data);
  };

  const fetchQuickReplies = async () => {
    const { data } = await supabase.from('quick_replies').select('*');
    if (data) setQuickReplies(data);
  };

  const fetchMessages = async (chatId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .neq('sender_type', 'note')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      scrollToBottom();
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      showError('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim() || !user) return;
    
    setIsCreatingChat(true);
    try {
      // 1. Create or find contact
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .upsert({ 
          phone_number: newChatPhone, 
          name: newChatName || 'New Customer' 
        }, { onConflict: 'phone_number' })
        .select()
        .single();

      if (contactError) throw contactError;

      // 2. Create chat
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({ 
          contact_id: contact.id, 
          assigned_to: user.id,
          status: 'open'
        })
        .select(`
          id, status, unread_count, updated_at, assigned_to,
          contacts (id, name, phone_number, is_blocked),
          profiles (id, first_name, last_name)
        `)
        .single();

      if (chatError) throw chatError;

      showSuccess('Conversation started');
      setIsNewChatModalOpen(false);
      setNewChatPhone('');
      setNewChatName('');
      fetchChats();
      setActiveChat(chat);
    } catch (err: any) {
      showError('Failed to start conversation');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const assignAgent = async (agentId: string) => {
    if (!activeChat) return;
    setIsAssigning(true);
    try {
      const { error } = await supabase
        .from('chats')
        .update({ assigned_to: agentId })
        .eq('id', activeChat.id);
      
      if (error) throw error;
      showSuccess('Conversation reassigned');
      fetchChats();
      const agent = agents.find(a => a.id === agentId);
      setActiveChat({ ...activeChat, assigned_to: agentId, profiles: agent });
    } catch (err) {
      showError('Assignment failed');
    } finally {
      setIsAssigning(false);
    }
  };

  const simulateCustomerReply = async () => {
    if (!activeChat) return;
    try {
      const types = ['text', 'image', 'file'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      let content = "Hello! I need help with my order.";
      if (type === 'image') content = "ATTACHMENT_IMAGE:https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=400";
      if (type === 'file') content = "ATTACHMENT_FILE:Receipt_Invoice_#4920.pdf";

      const { error } = await supabase.from('messages').insert({
        chat_id: activeChat.id,
        content,
        sender_type: 'customer'
      });
      if (error) throw error;

      await supabase.from('chats').update({ updated_at: new Date().toISOString(), unread_count: (activeChat.unread_count || 0) + 1 }).eq('id', activeChat.id);
      showSuccess(`Simulated incoming ${type}`);
      fetchMessages(activeChat.id);
    } catch (err) {
      showError("Simulation failed");
    }
  };

  useEffect(() => {
    fetchChats();
    fetchAgents();
    fetchQuickReplies();

    const channel = supabase.channel('public-changes-v8')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (activeChat) fetchMessages(activeChat.id);
        fetchChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchChats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
      if (activeChat.unread_count > 0) {
        supabase.from('chats').update({ unread_count: 0 }).eq('id', activeChat.id).then(() => {
          setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, unread_count: 0 } : c));
        });
      }
    }
  }, [activeChat?.id]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeChat || !user) return;
    const messageText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        chat_id: activeChat.id,
        content: messageText,
        sender_type: 'agent',
        sender_id: user.id
      });
      if (error) throw error;
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', activeChat.id);
      fetchMessages(activeChat.id);
      scrollToBottom();
    } catch (error: any) {
      showError('Failed to send message');
      setNewMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const updateChatStatus = async (status: string) => {
    if (!activeChat) return;
    try {
      const { error } = await supabase.from('chats').update({ status }).eq('id', activeChat.id);
      if (error) throw error;
      showSuccess(`Chat marked as ${status}`);
      if (status === 'resolved' || status === 'snoozed') setActiveChat(null);
      else setActiveChat({ ...activeChat, status });
      fetchChats();
    } catch (err: any) {
      showError('Failed to update status');
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredChats = chats.filter(chat => {
    const term = searchQuery.toLowerCase();
    const nameMatch = chat.contacts?.name?.toLowerCase().includes(term);
    const phoneMatch = chat.contacts?.phone_number?.toLowerCase().includes(term);
    const passesSearch = (nameMatch || phoneMatch);
    const passesFilter = inboxFilter === 'all' || chat.assigned_to === user?.id;
    return passesSearch && passesFilter && chat.status === 'open';
  });

  const renderMessageContent = (content: string) => {
    if (content.startsWith('ATTACHMENT_IMAGE:')) {
      const url = content.replace('ATTACHMENT_IMAGE:', '');
      return (
        <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200 mt-2 bg-slate-50">
          <img src={url} alt="Attachment" className="max-w-full h-auto object-cover max-h-[300px]" />
          <div className="p-2 bg-white flex items-center space-x-2 text-[10px] text-slate-500 font-bold uppercase">
            <ImageIcon size={12} />
            <span>Image received</span>
          </div>
        </div>
      );
    }
    if (content.startsWith('ATTACHMENT_FILE:')) {
      const filename = content.replace('ATTACHMENT_FILE:', '');
      return (
        <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2">
          <div className="bg-white p-2 rounded-lg text-indigo-600 shadow-sm">
            <FileIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{filename}</p>
            <p className="text-[10px] text-slate-400">PDF Document • 1.2 MB</p>
          </div>
        </div>
      );
    }
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>;
  };

  return (
    <div className="flex h-full w-full bg-white rounded-l-3xl shadow-sm overflow-hidden border-y border-l border-slate-200 my-2">
      <div className="w-80 flex flex-col border-r border-slate-100 bg-slate-50/50">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Inbox</h2>
          <button 
            onClick={() => setIsNewChatModalOpen(true)}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            title="New Conversation"
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button 
              onClick={() => setInboxFilter('mine')}
              className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all ${inboxFilter === 'mine' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Mine
            </button>
            <button 
              onClick={() => setInboxFilter('all')}
              className={`flex-1 text-[10px] font-bold px-2 py-1.5 rounded-md transition-all ${inboxFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search chats..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredChats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className={`p-3 rounded-2xl cursor-pointer transition-all ${
                activeChat?.id === chat.id 
                  ? 'bg-white border border-indigo-100 shadow-md' 
                  : 'hover:bg-slate-100 border border-transparent'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-semibold text-sm truncate max-w-[140px] ${activeChat?.id === chat.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                  {chat.contacts?.name || chat.contacts?.phone_number}
                </h3>
                <span className="text-[10px] text-slate-400">{formatTime(chat.updated_at)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[120px]">
                  {chat.profiles?.first_name || 'Unassigned'}
                </span>
                {chat.unread_count > 0 && (
                  <span className="bg-indigo-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                    {chat.unread_count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeChat ? (
        <div className="flex-1 flex flex-col bg-white">
          <div className="h-16 border-b border-slate-100 px-6 flex items-center justify-between bg-white shadow-sm z-10">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm">
                {(activeChat.contacts?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <h2 className="font-bold text-slate-800 leading-tight">{activeChat.contacts?.name || 'Unknown'}</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Active</span>
                  <span className="text-slate-300 text-[10px]">•</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center hover:text-indigo-800">
                      {isAssigning ? <Loader2 className="animate-spin mr-1" size={10} /> : <UserPlus size={10} className="mr-1" />}
                      <span>{activeChat.profiles?.first_name || 'Unassigned'}</span>
                      <ChevronDown size={10} className="ml-0.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="rounded-xl border-slate-100 shadow-xl w-48">
                      <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Assign to...</p>
                      {agents.map(agent => (
                        <DropdownMenuItem key={agent.id} onClick={() => assignAgent(agent.id)} className="px-3 py-2.5 flex items-center space-x-2 cursor-pointer">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">{agent.first_name.charAt(0)}</div>
                          <span className="text-sm font-medium">{agent.first_name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <button onClick={simulateCustomerReply} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
              <RefreshCcw size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {loadingMessages ? (
              <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-slate-300" size={32} /></div>
            ) : (
              messages.map(msg => {
                const isAgent = msg.sender_type === 'agent';
                return (
                  <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${isAgent ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                      {renderMessageContent(msg.content)}
                      <div className={`text-[9px] mt-1 text-right ${isAgent ? 'text-indigo-200' : 'text-slate-400'}`}>{formatTime(msg.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-100 z-10">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className="text-[10px] font-extrabold text-indigo-600 flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-colors uppercase">
                    <Zap size={12} />
                    <span>Quick Replies</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 rounded-xl border-slate-200 shadow-xl max-h-60 overflow-y-auto">
                    {quickReplies.map(reply => (
                      <DropdownMenuItem key={reply.id} onClick={() => setNewMessage(reply.content)} className="flex flex-col items-start space-y-1 p-3 cursor-pointer">
                        <span className="font-bold text-slate-800 text-xs">{reply.title}</span>
                        <span className="text-[10px] text-slate-400 truncate w-full">{reply.content}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Paperclip size={16} />
                </button>
              </div>
              <div className="flex items-end space-x-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                <textarea 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder="Type a message..." 
                  className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none py-3 px-2 focus:outline-none text-sm text-slate-800"
                  rows={1}
                />
                <button onClick={handleSendMessage} disabled={isSending || !newMessage.trim()} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">
                  {isSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center"><MessageSquare size={32} /></div>
          <p className="font-medium">Select a conversation to start chatting</p>
        </div>
      )}

      {activeChat && (
        <div className="w-80 bg-slate-50/50 border-l border-slate-100 flex flex-col z-10 overflow-hidden">
          <div className="flex border-b border-slate-100 bg-white">
            <button onClick={() => setRightTab('info')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all ${rightTab === 'info' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Info</button>
            <button onClick={() => setRightTab('notes')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all ${rightTab === 'notes' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Notes</button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            {rightTab === 'info' ? (
              <div className="space-y-8">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-3xl font-bold shadow-md mb-4 uppercase">{(activeChat.contacts?.name || '?').charAt(0)}</div>
                  <h2 className="text-lg font-bold text-slate-800">{activeChat.contacts?.name || 'Unknown'}</h2>
                  <p className="text-slate-500 text-sm font-mono">{activeChat.contacts?.phone_number}</p>
                </div>
                
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-md border border-indigo-100">Sales</span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-md border border-slate-200 flex items-center space-x-1 cursor-pointer hover:bg-slate-200">
                      <Plus size={10} />
                      <span>Add Tag</span>
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => updateChatStatus('resolved')} className="flex flex-col items-center py-3 border border-slate-200 rounded-xl bg-white hover:border-green-500 hover:text-green-600 transition-all shadow-sm"><CheckCircle size={18} /><span className="text-[9px] font-bold uppercase mt-1">Resolve</span></button>
                    <button onClick={() => updateChatStatus('snoozed')} className="flex flex-col items-center py-3 border border-slate-200 rounded-xl bg-white hover:border-orange-500 hover:text-orange-600 transition-all shadow-sm"><Clock size={18} /><span className="text-[9px] font-bold uppercase mt-1">Snooze</span></button>
                  </div>
                </div>
              </div>
            ) : (
              <ContactNotes contactId={activeChat.id} />
            )}
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-2xl font-extrabold text-slate-900">New Conversation</h2>
              <button onClick={() => setIsNewChatModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateChat} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Phone Number</label>
                <input 
                  type="tel" 
                  required
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Customer Name (Optional)</label>
                <input 
                  type="text" 
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Jane Doe"
                />
              </div>
              <button 
                type="submit" 
                disabled={isCreatingChat || !newChatPhone.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center space-x-2"
              >
                {isCreatingChat ? <Loader2 className="animate-spin" size={20} /> : <MessageSquarePlus size={20} />}
                <span>Start Chatting</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}