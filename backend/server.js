require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '50mb' }));

// Health check endpoint (used by Railway and other platforms)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', waReady: isReady, timestamp: new Date().toISOString() });
});

// Supabase client
// Use SUPABASE_SERVICE_ROLE_KEY env var (bypasses RLS) for full backend persistence.
// Falls back to anon key — in that case the frontend handles record creation on demand.
const SUPABASE_URL = 'https://tntzfnqymqgyzcuttsyn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudHpmbnF5bXFneXpjdXR0c3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDgzOTksImV4cCI6MjA4ODA4NDM5OX0.hX8rIZzHR1k1JmiK7rXbJ1qTUTBWA7PLrkWVbNV91po';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!hasServiceRole) {
  console.warn('[Supabase] Using anon key — backend persistence skipped (RLS). Set SUPABASE_SERVICE_ROLE_KEY in backend/.env for full sync.');
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Allow long-polling as a fallback so Render's reverse proxy doesn't block connections
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Puppeteer executable path can be overridden via env var (e.g. Railway system Chromium)
const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',   // critical in containers where /dev/shm is small
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',           // reduces memory usage in cloud envs
  '--disable-extensions',
];

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.WA_SESSION_PATH || './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: puppeteerArgs,
  },
});

let isReady = false;
let qrCodeData = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * "1234567890@c.us" → "+1234567890"
 * "@lid" IDs are NOT real phone numbers – return null for those.
 */
function waIdToPhone(waId) {
  if (!waId) return null;
  if (waId.endsWith('@g.us'))  return null; // group – no phone
  if (waId.endsWith('@lid'))   return null; // LID – not a phone number
  const number = waId.split('@')[0];
  return '+' + number;
}

/**
 * Try to get the true E.164 phone number for a contact, even if the
 * chat ID uses the newer LID format.  Returns "+XXXXXXX" or null.
 */
async function resolvePhone(chat) {
  // Fast path: classic c.us format
  if (chat.id._serialized.endsWith('@c.us')) return '+' + chat.id.user;
  if (chat.isGroup) return null;
  // LID or unknown format – ask whatsapp-web.js for the contact
  try {
    const contact = await chat.getContact();
    if (contact.number) return '+' + contact.number;
  } catch { /* ignore */ }
  return null;
}

/** "+1234567890" or "1234567890" → "1234567890@c.us" */
function phoneToWaId(phone) {
  const number = phone.replace(/^\+/, '').replace(/[\s\-()]/g, '');
  return number + '@c.us';
}

// ─── Supabase helpers ────────────────────────────────────────────────────────

/**
 * Persist an incoming (customer) or outgoing (agent via WA) message to Supabase.
 * Only runs when SUPABASE_SERVICE_ROLE_KEY is set (bypasses RLS).
 * Without it, the frontend handles record creation lazily when a chat is opened.
 */
async function persistMessageToSupabase({ phone, name, content, senderType }) {
  if (!hasServiceRole) return null;
  try {
    // 1. Upsert contact
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .upsert(
        { phone_number: phone, name: name || phone },
        { onConflict: 'phone_number', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (contactErr) {
      console.error('Supabase contact upsert error:', contactErr);
      return null;
    }

    // 2. Find active (open/snoozed) chat or create a new one
    const { data: existingChat } = await supabase
      .from('chats')
      .select('*')
      .eq('contact_id', contact.id)
      .in('status', ['open', 'snoozed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    let chat = existingChat;
    if (!chat) {
      const { data: newChat, error: chatErr } = await supabase
        .from('chats')
        .insert({ contact_id: contact.id, status: 'open', unread_count: 0 })
        .select()
        .single();
      if (chatErr) {
        console.error('Supabase chat insert error:', chatErr);
        return null;
      }
      chat = newChat;
    }

    // 3. Insert message
    const { error: msgErr } = await supabase.from('messages').insert({
      chat_id: chat.id,
      content: content || '',
      sender_type: senderType,
    });
    if (msgErr) {
      console.error('Supabase message insert error:', msgErr);
      return null;
    }

    // 4. Update chat timestamp + unread count (only increment for customer messages)
    const updates = { updated_at: new Date().toISOString() };
    if (senderType === 'customer') {
      const newUnread = (chat.unread_count || 0) + 1;
      updates.unread_count = newUnread;
      // Re-open snoozed chats when customer replies
      if (chat.status === 'snoozed') updates.status = 'open';
    }
    await supabase.from('chats').update(updates).eq('id', chat.id);

    return chat.id;
  } catch (err) {
    console.error('persistMessageToSupabase unexpected error:', err);
    return null;
  }
}

// ─── REST API ────────────────────────────────────────────────────────────────

/** Health / status check */
app.get('/api/status', (req, res) => {
  res.json({ ready: isReady });
});

/**
 * Send a WhatsApp message on behalf of an agent.
 * Body: { phone_number: string, message: string }
 */
app.post('/api/send-message', async (req, res) => {
  const { phone_number, message } = req.body;
  if (!phone_number || !message) {
    return res.status(400).json({ error: 'phone_number and message are required' });
  }
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp engine not ready' });
  }
  try {
    const waId = phoneToWaId(phone_number);
    await client.sendMessage(waId, message);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to send WA message:', err);
    res.status(500).json({ error: 'Failed to send message via WhatsApp' });
  }
});

/**
 * Download media for a specific WA message.
 * GET /api/media/:messageId
 * Returns { mimetype, data (base64), filename }
 */
app.get('/api/media/:messageId', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not ready' });
  try {
    const messageId = decodeURIComponent(req.params.messageId);
    const msg = await client.getMessageById(messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!msg.hasMedia) return res.status(400).json({ error: 'Message has no media' });

    const media = await msg.downloadMedia().catch(() => null);
    if (!media) return res.status(404).json({ error: 'Could not download media' });

    res.json({
      mimetype: media.mimetype || 'application/octet-stream',
      data: media.data,
      filename: media.filename || null,
    });
  } catch (err) {
    console.error('Media fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

/**
 * Send a media file via WhatsApp.
 * POST /api/send-media
 * Body: { phone_number, mimetype, data (base64), filename?, caption? }
 */
app.post('/api/send-media', async (req, res) => {
  const { phone_number, mimetype, data, filename, caption } = req.body;
  if (!phone_number || !mimetype || !data) {
    return res.status(400).json({ error: 'phone_number, mimetype and data are required' });
  }
  if (!isReady) return res.status(503).json({ error: 'WhatsApp engine not ready' });
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const waId = phoneToWaId(phone_number);
    const media = new MessageMedia(mimetype, data, filename || null);
    await client.sendMessage(waId, media, caption ? { caption } : {});
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to send media:', err);
    res.status(500).json({ error: 'Failed to send media' });
  }
});

/**
 * Get profile picture URL for a WA contact.
 * GET /api/profile-pic/:waId
 */
app.get('/api/profile-pic/:waId', async (req, res) => {
  if (!isReady) return res.json({ url: null });
  try {
    const waId = decodeURIComponent(req.params.waId);
    const contact = await client.getContactById(waId).catch(() => null);
    if (!contact) return res.json({ url: null });
    const url = await contact.getProfilePicUrl().catch(() => null);
    res.json({ url: url || null });
  } catch {
    res.json({ url: null });
  }
});

/**
 * Block a WA contact.
 * POST /api/block/:waId
 */
app.post('/api/block/:waId', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WA not ready' });
  try {
    const waId = decodeURIComponent(req.params.waId);
    const contact = await client.getContactById(waId);
    await contact.block();
    res.json({ success: true });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Failed to block contact' });
  }
});

/**
 * Unblock a WA contact.
 * POST /api/unblock/:waId
 */
app.post('/api/unblock/:waId', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WA not ready' });
  try {
    const waId = decodeURIComponent(req.params.waId);
    const contact = await client.getContactById(waId);
    await contact.unblock();
    res.json({ success: true });
  } catch (err) {
    console.error('Unblock error:', err);
    res.status(500).json({ error: 'Failed to unblock contact' });
  }
});

/**
 * Pin a WA chat.
 * POST /api/pin-chat/:chatId
 */
app.post('/api/pin-chat/:chatId', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WA not ready' });
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    const chat = await client.getChatById(chatId);
    await chat.pin();
    res.json({ success: true });
  } catch (err) {
    console.error('Pin error:', err);
    res.status(500).json({ error: 'Failed to pin chat' });
  }
});

/**
 * Unpin a WA chat.
 * POST /api/unpin-chat/:chatId
 */
app.post('/api/unpin-chat/:chatId', async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WA not ready' });
  try {
    const chatId = decodeURIComponent(req.params.chatId);
    const chat = await client.getChatById(chatId);
    await chat.unpin();
    res.json({ success: true });
  } catch (err) {
    console.error('Unpin error:', err);
    res.status(500).json({ error: 'Failed to unpin chat' });
  }
});

// ─── Analytics: Timing ───────────────────────────────────────────────────────

/**
 * Compute First Response Time (FRT) and Resolution Time (RT) for all chats.
 * FRT  = time from chat.created_at  → first agent message.created_at (minutes)
 * RT   = time from chat.created_at  → chat.updated_at (hours, resolved chats only)
 *
 * GET /api/analytics/timing?since=ISO_DATE
 */
app.get('/api/analytics/timing', async (req, res) => {
  if (!hasServiceRole) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY required' });
  try {
    const since = req.query.since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // 1. All chats in range
    const { data: chats, error: ce } = await supabase
      .from('chats')
      .select('id, status, assigned_to, created_at, updated_at')
      .gte('created_at', since);
    if (ce) throw ce;

    if (!chats || chats.length === 0) {
      return res.json({ platform: { avgFrtMin: 0, medianFrtMin: 0, avgRtHours: 0, medianRtHours: 0, totalChatsWithFrt: 0, totalResolved: 0 }, frtDistribution: [], rtDistribution: [], agentTiming: [] });
    }

    const chatIds = chats.map(c => c.id);

    // 2. First agent message per chat (fetch sorted ASC, deduplicate in JS)
    const { data: agentMsgs, error: me } = await supabase
      .from('messages')
      .select('id, chat_id, sender_id, created_at')
      .eq('sender_type', 'agent')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: true });
    if (me) throw me;

    // 3. Profiles
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name');

    // Build map: chat_id → first agent message
    const firstMsg = {};
    (agentMsgs || []).forEach(m => {
      if (!firstMsg[m.chat_id]) firstMsg[m.chat_id] = m;
    });

    // ── Helpers ──────────────────────────────────────────────────────────────
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const median = arr => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    // ── Per-chat timing ───────────────────────────────────────────────────────
    const frtAll = [];       // all FRT values in minutes
    const rtAll  = [];       // all RT values in hours (resolved only)
    const agentFrts = {};    // agentId → [frtMin, ...]
    const agentRts  = {};    // agentId → [rtH, ...]

    chats.forEach(chat => {
      const fm = firstMsg[chat.id];
      if (fm) {
        const frtMin = (new Date(fm.created_at) - new Date(chat.created_at)) / 60000;
        if (frtMin >= 0 && frtMin < 43200) {  // sanity: < 30 days
          frtAll.push(frtMin);
          const aid = fm.sender_id;
          if (aid) { (agentFrts[aid] = agentFrts[aid] || []).push(frtMin); }
        }
      }
      if (chat.status === 'resolved') {
        const rtH = (new Date(chat.updated_at) - new Date(chat.created_at)) / 3600000;
        if (rtH >= 0) {
          rtAll.push(rtH);
          const aid = chat.assigned_to;
          if (aid) { (agentRts[aid] = agentRts[aid] || []).push(rtH); }
        }
      }
    });

    // ── Distribution buckets ──────────────────────────────────────────────────
    const FRT_BUCKETS = [
      { label: '< 5m',   min: 0,   max: 5   },
      { label: '5–15m',  min: 5,   max: 15  },
      { label: '15–30m', min: 15,  max: 30  },
      { label: '30–60m', min: 30,  max: 60  },
      { label: '1–4h',   min: 60,  max: 240 },
      { label: '4h+',    min: 240, max: Infinity },
    ];
    const RT_BUCKETS = [
      { label: '< 1h',  min: 0,   max: 1   },
      { label: '1–4h',  min: 1,   max: 4   },
      { label: '4–24h', min: 4,   max: 24  },
      { label: '1–3d',  min: 24,  max: 72  },
      { label: '3–7d',  min: 72,  max: 168 },
      { label: '7d+',   min: 168, max: Infinity },
    ];
    const frtDistribution = FRT_BUCKETS.map(b => ({ label: b.label, count: frtAll.filter(v => v >= b.min && v < b.max).length }));
    const rtDistribution  = RT_BUCKETS.map(b => ({ label: b.label, count: rtAll.filter(v => v >= b.min && v < b.max).length }));

    // ── Per-agent timing ──────────────────────────────────────────────────────
    const agentTiming = (profiles || []).map(p => {
      const frts = agentFrts[p.id] || [];
      const rts  = agentRts[p.id]  || [];
      return {
        id: p.id,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
        avgFrtMin:     avg(frts),
        medianFrtMin:  median(frts),
        avgRtHours:    avg(rts),
        medianRtHours: median(rts),
        chatsWithFrt:  frts.length,
        resolvedChats: rts.length,
      };
    });

    res.json({
      platform: {
        avgFrtMin:    avg(frtAll),
        medianFrtMin: median(frtAll),
        avgRtHours:   avg(rtAll),
        medianRtHours: median(rtAll),
        totalChatsWithFrt: frtAll.length,
        totalResolved: rtAll.length,
      },
      frtDistribution,
      rtDistribution,
      agentTiming,
    });
  } catch (err) {
    console.error('Timing analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Team Management API ─────────────────────────────────────────────────────

/**
 * List all team members (profiles + emails from auth).
 * GET /api/team/members
 */
app.get('/api/team/members', async (req, res) => {
  if (!hasServiceRole) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env' });
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role');
    const pMap = {};
    profiles?.forEach(p => { pMap[p.id] = p; });
    const members = users.map(u => ({
      id: u.id,
      email: u.email,
      first_name: pMap[u.id]?.first_name || '',
      last_name: pMap[u.id]?.last_name || '',
      role: pMap[u.id]?.role || 'agent',
      created_at: u.created_at,
    }));
    res.json({ members });
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new team member.
 * POST /api/team/members  { email, password, first_name, last_name, role }
 */
app.post('/api/team/members', async (req, res) => {
  if (!hasServiceRole) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env' });
  try {
    const { email, password, first_name, last_name, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const { data: { user }, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: first_name || '', last_name: last_name || '' },
    });
    if (error) throw error;
    await supabase.from('profiles').upsert({
      id: user.id,
      first_name: first_name || '',
      last_name: last_name || '',
      role: role || 'agent',
      updated_at: new Date().toISOString(),
    });
    res.json({ success: true, member: { id: user.id, email: user.email, first_name, last_name, role } });
  } catch (err) {
    console.error('Create member error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update a team member's role.
 * PATCH /api/team/members/:id/role  { role }
 */
app.patch('/api/team/members/:id/role', async (req, res) => {
  if (!hasServiceRole) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env' });
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role is required' });
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a team member.
 * DELETE /api/team/members/:id
 */
app.delete('/api/team/members/:id', async (req, res) => {
  if (!hasServiceRole) return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in backend/.env' });
  try {
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', async (socket) => {
  console.log('Frontend connected via socket');

  if (isReady) {
    socket.emit('ready');
    sendChatList(socket);
  } else if (qrCodeData) {
    socket.emit('qr', qrCodeData);
  }

  socket.on('send_message', async (data) => {
    try {
      const { chatId, message } = data;
      await client.sendMessage(chatId, message);
    } catch (err) {
      console.error('Failed to send message:', err);
      socket.emit('error', 'Failed to send message');
    }
  });

  socket.on('fetch_messages', async (data) => {
    if (!isReady) return;
    // Accept either a plain string chatId or { chatId, limit }
    const chatId = typeof data === 'string' ? data : data?.chatId;
    const limit  = (typeof data === 'object' && data?.limit) ? Math.min(data.limit, 500) : 50;
    if (!chatId) return;
    try {
      const chat = await client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });
      const formattedMessages = messages.map((msg) => ({
        id: msg.id._serialized,
        body: msg.body || (msg.hasMedia ? '' : ''),
        fromMe: msg.fromMe,
        timestamp: msg.timestamp,
        author: msg.author || msg.from,
        type: msg.type,
        hasMedia: msg.hasMedia,
      }));
      // Sort ascending by timestamp before sending
      formattedMessages.sort((a, b) => a.timestamp - b.timestamp);
      socket.emit('chat_messages', { chatId, messages: formattedMessages, limit });
    } catch (err) {
      console.error(`Failed to fetch messages for ${chatId}:`, err);
    }
  });

  socket.on('fetch_contacts', async () => {
    if (!isReady) return;
    try {
      const contacts = await client.getContacts();
      const formattedContacts = contacts
        .filter((c) => c.isUser)
        .map((c) => ({ id: c.id._serialized, name: c.name || c.pushname || c.number, number: c.number }));
      socket.emit('contacts', formattedContacts);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  });
});

async function sendChatList(socket = io) {
  if (!isReady) return;
  try {
    const chats = await client.getChats();

    // Resolve phone numbers in parallel (batched to avoid flooding)
    const BATCH = 25;
    const phoneMap = {};
    const nonGroup = chats.filter(c => !c.isGroup);
    for (let i = 0; i < nonGroup.length; i += BATCH) {
      await Promise.all(
        nonGroup.slice(i, i + BATCH).map(async (chat) => {
          phoneMap[chat.id._serialized] = await resolvePhone(chat);
        })
      );
    }

    const formattedChats = chats.map((chat) => {
      let messageBody = null;
      if (chat.lastMessage) {
        messageBody = chat.lastMessage.body;
        if (!messageBody && chat.lastMessage.hasMedia) messageBody = '[Media]';
      }
      return {
        id: chat.id._serialized,
        name: chat.name || chat.id.user,
        phone: phoneMap[chat.id._serialized] || null,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
        timestamp: chat.timestamp,
        lastMessage: messageBody,
        isPinned: chat.pinned || false,
      };
    });
    socket.emit('chats', formattedChats);
  } catch (err) {
    console.error('Error fetching chats:', err);
  }
}

// ─── WhatsApp Client Events ──────────────────────────────────────────────────

client.on('qr', async (qr) => {
  console.log('QR RECEIVED');
  isReady = false;
  try {
    qrCodeData = await qrcode.toDataURL(qr);
    io.emit('qr', qrCodeData);
  } catch (err) {
    console.error('Failed to generate QR base64', err);
  }
});

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
  isReady = true;
  qrCodeData = null;
  io.emit('ready');
  sendChatList();
});

client.on('authenticated', () => {
  console.log('WhatsApp Client authenticated!');
  io.emit('authenticated');
});

client.on('auth_failure', (msg) => {
  console.error('AUTHENTICATION FAILURE', msg);
  io.emit('error', 'Authentication Failure');
});

client.on('disconnected', (reason) => {
  console.log('WhatsApp Client was disconnected', reason);
  isReady = false;
  io.emit('disconnected', reason);
  client.initialize();
});

// ─── Incoming customer message ────────────────────────────────────────────────
client.on('message', async (msg) => {
  // Skip group messages (only handle individual chats)
  if (msg.from.endsWith('@g.us')) return;

  const chat = await msg.getChat();

  // Emit to socket.io (for WhatsAppIntercom / realtime updates)
  io.emit('new_message', {
    chatId: chat.id._serialized,
    message: {
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      author: msg.author || msg.from,
      type: msg.type,
      hasMedia: msg.hasMedia,
    },
  });

  // Persist to Supabase – use actual contact number (handles LID-based IDs)
  const contact = await msg.getContact();
  const phone = contact.number
    ? '+' + contact.number
    : waIdToPhone(msg.from);   // fallback for @c.us format
  if (!phone) return;           // skip if we truly can't determine the phone
  const name = contact.name || contact.pushname || contact.number || null;
  const content = msg.body || (msg.hasMedia ? '[Media]' : '');

  await persistMessageToSupabase({ phone, name, content, senderType: 'customer' });

  sendChatList();
});

// Outgoing messages via Socket.io intercom (not from CRM Inbox — those are saved by frontend)
client.on('message_create', async (msg) => {
  if (!msg.fromMe) return;

  const chat = await msg.getChat();
  io.emit('new_message', {
    chatId: chat.id._serialized,
    message: {
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      author: msg.author || msg.from,
      type: msg.type,
      hasMedia: msg.hasMedia,
    },
  });
});

// ─── Admin: Clear all storage (messages, chats, contacts) ───────────────────

app.post('/api/admin/clear-storage', async (_req, res) => {
  if (!hasServiceRole) {
    return res.status(503).json({ error: 'Service role key not configured. Cannot clear storage.' });
  }
  try {
    // Order matters due to foreign key constraints: messages → chats → contacts
    const { error: msgErr }  = await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (msgErr) throw msgErr;
    const { error: chatErr } = await supabase.from('chats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (chatErr) throw chatErr;
    const { error: conErr }  = await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (conErr) throw conErr;
    console.log('[Admin] Storage cleared — messages, chats and contacts deleted.');
    res.json({ success: true, message: 'All messages, chats and contacts have been deleted from storage.' });
  } catch (err) {
    console.error('[Admin] clear-storage error:', err);
    res.status(500).json({ error: err.message || 'Failed to clear storage.' });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

client.initialize();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
