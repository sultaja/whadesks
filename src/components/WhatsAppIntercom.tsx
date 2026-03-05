import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import QRCode from 'react-qr-code';
import { MessageSquare, Send, CheckCheck, Loader2, Phone, Search, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';

// Define the interface for a raw WhatsApp message from the backend
interface Message {
    id: string;
    body: string;
    fromMe: boolean;
    timestamp: number;
    author: string;
    type: string;
    hasMedia: boolean;
}

interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    timestamp: number;
    lastMessage: string | null;
}

export const WhatsAppIntercom = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const [chats, setChats] = useState<Chat[]>([]);
    const [contacts, setContacts] = useState<Array<{ id: string, name: string, number: string }>>([]);
    const [showContacts, setShowContacts] = useState(false);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [messageInput, setMessageInput] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Connect to the backend
        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to backend WS');
            setIsConnected(true);
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from backend WS');
            setIsConnected(false);
            setIsReady(false);
        });

        newSocket.on('qr', () => {
            console.log('Backend requires QR scan by admin');
            setIsReady(false);
        });

        newSocket.on('ready', () => {
            console.log('WhatsApp is ready');
            setIsReady(true);
            newSocket.emit('fetch_contacts');
        });

        newSocket.on('contacts', (incomingContacts: Array<{ id: string, name: string, number: string }>) => {
            setContacts(incomingContacts);
        });

        newSocket.on('authenticated', () => {
            console.log('WhatsApp is authenticated');
        });

        newSocket.on('chats', (incomingChats: Chat[]) => {
            console.log('Received chats', incomingChats.length);
            setChats(incomingChats.sort((a, b) => b.timestamp - a.timestamp));
        });

        newSocket.on('chat_messages', (data: { chatId: string; messages: Message[] }) => {
            setMessages((prev) => ({
                ...prev,
                [data.chatId]: data.messages.reverse() // Reverse to show oldest first since they might come newest limited
            }));
        });

        newSocket.on('new_message', (data: { chatId: string; message: Message }) => {
            setMessages((prev) => {
                const chatMessages = prev[data.chatId] || [];
                // Prevent duplicate messages in UI by checking ID
                if (chatMessages.some(m => m.id === data.message.id)) {
                    return prev;
                }
                return {
                    ...prev,
                    [data.chatId]: [...chatMessages, data.message],
                };
            });
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (selectedChat && socket) {
            if (!messages[selectedChat.id]) {
                socket.emit('fetch_messages', selectedChat.id);
            }
        }
    }, [selectedChat, socket, messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedChat]);

    const handleContactSelect = (contact: { id: string, name: string, number: string }) => {
        const existingChat = chats.find(c => c.id === contact.id);
        if (existingChat) {
            setSelectedChat(existingChat);
        } else {
            const tempChat: Chat = {
                id: contact.id,
                name: contact.name,
                isGroup: false,
                unreadCount: 0,
                timestamp: Date.now() / 1000,
                lastMessage: null
            };
            setSelectedChat(tempChat);
        }
        setShowContacts(false);
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim() || !selectedChat || !socket) return;

        socket.emit('send_message', {
            chatId: selectedChat.id,
            message: messageInput.trim(),
        });

        setMessageInput('');
    };

    const currentMessages = selectedChat ? messages[selectedChat.id] || [] : [];

    const formatTimestamp = (ts: number) => {
        try {
            return format(new Date(ts * 1000), 'p'); // 'p' for local time (e.g. 12:00 PM)
        } catch {
            return '';
        }
    };

    // ------------------------------------------
    // RENDER PENDING / QR CODE STATE
    // ------------------------------------------
    if (!isConnected) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50/50 dark:bg-black/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 shadow-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Connecting to backend...</p>
                </div>
            </div>
        );
    }

    if (!isReady) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50/50 dark:bg-black/50">
                <div className="flex flex-col items-center gap-6 rounded-xl border bg-card p-10 shadow-lg max-w-sm w-full text-center">
                    <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/40">
                        <MessageSquare className="h-8 w-8 text-amber-600 dark:text-amber-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold tracking-tight">Engine Offline</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Waiting for an Administrator to connect the WhatsApp Engine via the Settings panel.
                        </p>
                    </div>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-4" />
                </div>
            </div>
        );
    }

    // ------------------------------------------
    // RENDER MAIN DASHBOARD
    // ------------------------------------------
    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            {/* Sidebar for Navigation (Mocked for realism) */}
            <div className="hidden w-16 flex-col items-center border-r bg-muted/20 py-4 sm:flex shrink-0">
                <div className="mb-8 rounded-full bg-green-500/10 p-2">
                    <MessageSquare className="h-6 w-6 text-green-500" />
                </div>
                <div className="flex flex-col gap-4">
                    <Button variant="ghost" size="icon" className="rounded-full text-primary bg-primary/10">
                        <MessageSquare className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground">
                        <Users className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground">
                        <Phone className="h-5 w-5" />
                    </Button>
                </div>
                <div className="mt-auto">
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground">
                        <Settings className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Sidebar for Chat List */}
            <div className="w-full sm:w-[340px] border-r flex flex-col shrink-0 bg-card/50">
                <div className="flex items-center p-4 border-b gap-3 h-[70px] justify-between">
                    <h1 className="text-xl font-bold font-inter tracking-tight">Messages</h1>
                    <Button variant="outline" size="sm" onClick={() => setShowContacts(!showContacts)} className="h-8">
                        {showContacts ? 'Back to Chats' : 'New Chat'}
                    </Button>
                </div>
                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search conversations..."
                            className="pl-9 bg-muted/50 border-none w-full"
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1 w-full">
                    {showContacts ? (
                        <div className="flex flex-col px-2 pb-2 gap-1 mt-1">
                            {contacts.length === 0 && (
                                <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center">
                                    <Loader2 className="h-5 w-5 animate-spin mb-3 text-primary" />
                                    <p>Loading contacts from WhatsApp...</p>
                                </div>
                            )}
                            {contacts.map((contact) => (
                                <button
                                    key={contact.id}
                                    onClick={() => handleContactSelect(contact)}
                                    className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all hover:bg-muted/80"
                                >
                                    <Avatar className="h-10 w-10 border shadow-sm">
                                        <AvatarFallback className="bg-emerald-100 text-emerald-800">
                                            {contact.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-1 flex-col overflow-hidden">
                                        <span className="font-medium truncate text-sm">{contact.name}</span>
                                        <span className="text-xs text-muted-foreground">{contact.number}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col px-2 pb-2 gap-1 mt-1">
                            {chats.map((chat) => (
                                <button
                                    key={chat.id}
                                    onClick={() => setSelectedChat(chat)}
                                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all hover:bg-muted/80 ${selectedChat?.id === chat.id ? 'bg-primary/5 dark:bg-primary/10' : ''
                                        }`}
                                >
                                    <Avatar className="h-10 w-10 border shadow-sm">
                                        <AvatarFallback className={chat.isGroup ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}>
                                            {chat.name.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-1 flex-col overflow-hidden">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium truncate text-sm">
                                                {chat.name || chat.id.split('@')[0]}
                                            </span>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                                {chat.timestamp > 0 ? formatTimestamp(chat.timestamp) : ''}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5">
                                            <p className="truncate text-xs text-muted-foreground pr-4">
                                                {chat.lastMessage || 'No recent messages'}
                                            </p>
                                            {chat.unreadCount > 0 && (
                                                <span className="flex h-5 items-center justify-center rounded-full bg-primary px-2 text-[10px] font-bold text-primary-foreground min-w-[20px]">
                                                    {chat.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {chats.length === 0 && (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    <p>No conversations found.</p>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Main Chat Area */}
            <div className="flex flex-1 flex-col relative bg-card/20 shadow-inner">
                {selectedChat ? (
                    <>
                        {/* Chat Area Header */}
                        <header className="flex h-[70px] shrink-0 items-center border-b px-6 bg-card/80 backdrop-blur-md z-10 sticky top-0">
                            <Avatar className="h-10 w-10 border shadow-sm mr-4 shrink-0">
                                <AvatarFallback className={selectedChat.isGroup ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}>
                                    {selectedChat.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <h2 className="text-base font-semibold truncate leading-tight">
                                    {selectedChat.name || selectedChat.id.split('@')[0]}
                                </h2>
                                <div className="text-xs text-muted-foreground truncate opacity-80 mt-0.5 flex flex-wrap gap-2">
                                    <span>{selectedChat.id.split('@')[0]}</span>
                                    {selectedChat.isGroup && <span className="bg-muted px-1.5 rounded-sm">Group</span>}
                                </div>
                            </div>
                        </header>

                        {/* Chat Messages */}
                        <ScrollArea className="flex-1 p-4 sm:p-6 w-full" id="messages-container">
                            <div className="flex flex-col gap-4 pb-4">
                                {currentMessages.length === 0 && (
                                    <div className="flex justify-center mt-10">
                                        <span className="bg-muted px-4 py-2 rounded-full text-xs text-muted-foreground">Start of conversation</span>
                                    </div>
                                )}
                                {currentMessages.map((msg, index) => {
                                    const isFirstInGroup = index === 0 || currentMessages[index - 1].fromMe !== msg.fromMe;

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex gap-3 max-w-[85%] ${msg.fromMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                                        >
                                            {!msg.fromMe && isFirstInGroup && selectedChat.isGroup && (
                                                <Avatar className="h-8 w-8 mt-1 border">
                                                    <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700">
                                                        {(msg.author || msg.id.split('@')[0]).substring(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                            )}
                                            {/* Empty space placeholder to align grouped messages */}
                                            {!msg.fromMe && !isFirstInGroup && selectedChat.isGroup && <div className="w-8 shrink-0" />}

                                            <div
                                                className={`flex flex-col group ${msg.fromMe ? 'items-end' : 'items-start'
                                                    }`}
                                            >
                                                <div
                                                    className={`rounded-2xl px-4 py-2.5 shadow-sm text-sm ${msg.fromMe
                                                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                                        : 'bg-card border rounded-tl-sm'
                                                        }`}
                                                >
                                                    {/* Media Placeholder Label for non-text messages */}
                                                    {msg.type !== 'chat' && (
                                                        <div className="text-xs opacity-70 mb-1 flex items-center gap-1">
                                                            <Loader2 className="h-3 w-3" /> [Media Attachment]
                                                        </div>
                                                    )}
                                                    <span className="break-words leading-relaxed">{msg.body}</span>
                                                </div>
                                                <span className="mt-1 text-[10px] text-muted-foreground/70 flex items-center gap-1 opacity-100 transition-opacity">
                                                    {formatTimestamp(msg.timestamp)}
                                                    {msg.fromMe && <CheckCheck className="h-3 w-3 text-muted-foreground/50" />}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} className="h-1" />
                            </div>
                        </ScrollArea>

                        {/* Message Input Area */}
                        <div className="p-4 sm:p-6 bg-card/80 backdrop-blur-md border-t shrink-0">
                            <form
                                onSubmit={handleSendMessage}
                                className="flex items-center gap-3 rounded-full border bg-background/50 pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary shadow-sm transition-all"
                            >
                                <Input
                                    className="flex-1 border-0 bg-transparent py-2 h-auto focus-visible:ring-0 shadow-none sm:text-sm px-0"
                                    placeholder="Type a message..."
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    className={`rounded-full shrink-0 transition-all ${messageInput.trim() ? "opacity-100 scale-100" : "opacity-50 scale-95"
                                        }`}
                                    disabled={!messageInput.trim()}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="hidden sm:flex flex-1 flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
                        <div className="mb-4 rounded-full bg-muted p-6">
                            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-xl font-medium text-foreground mb-2">WhatsApp Inbox</h3>
                        <p className="max-w-[300px] text-sm leading-relaxed text-muted-foreground/80">Select a conversation from the list to view your messages and reply instantly.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
