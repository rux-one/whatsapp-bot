require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const llm = require('./llm');

// --- Behavior config (not sensitive — kept in code) ---
const GREETING = 'Hello, World! 👋';
const COMMANDS = new Set(['/greet', '/hello']);

// --- Deployment config (via .env) ---
// Comma-separated group ids (e.g. 1203...@g.us). Empty => respond in all groups.
const ALLOWED_GROUPS = new Set(
  (process.env.WA_ALLOWED_GROUPS || '')
    .split(',').map((g) => g.trim()).filter(Boolean)
);
const CLIENT_ID = process.env.WA_CLIENT_ID || undefined; // names/segregates the session
const DATA_PATH = process.env.WA_DATA_PATH || undefined;  // where LocalAuth stores the session

// Reply sent when the LLM can't be reached (e.g. Ollama offline) or otherwise fails.
const LLM_FALLBACK_MESSAGE =
  process.env.LLM_FALLBACK_MESSAGE ||
  "⚠️ Sorry, I can't reach my brain right now. Please try again in a bit.";

// The bot's own ids, set on ready. WhatsApp addresses the same account by both a phone id
// (<number>@c.us) and a LID (<id>@lid); group mentions often use the LID form, so we track both.
const botIds = new Set();

const client = new Client({
  // Session credentials are persisted to DATA_PATH (default .wwebjs_auth/) — never committed
  authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: DATA_PATH }),
  puppeteer: {
    // Use a system Chromium when provided (e.g. /usr/bin/chromium in Docker); else the bundled one.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // --no-sandbox/--disable-setuid-sandbox: required on headless Linux/root/containers.
    // --disable-dev-shm-usage: avoid crashes when /dev/shm is small (containers).
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

// True if we should act in this chat. Non-group chats always allowed; groups gated by the allowlist
// when one is configured (empty allowlist = allow all groups). Non-destructive: just ignores.
function chatAllowed(chatId) {
  if (!chatId || !chatId.endsWith('@g.us')) return true;
  return ALLOWED_GROUPS.size === 0 || ALLOWED_GROUPS.has(chatId);
}

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code above with WhatsApp (Settings → Linked Devices → Link a Device).');
});

client.on('ready', async () => {
  const phoneId = client.info?.wid?._serialized || null;
  if (phoneId) botIds.add(phoneId);
  try {
    const [mapping] = await client.getContactLidAndPhone([phoneId]);
    if (mapping?.lid) botIds.add(mapping.lid); // the @lid form used in group mentions
  } catch (err) {
    console.warn('Could not resolve bot LID (mentions may not match):', err.message);
  }
  console.log(`✅ Bot connected and ready! ids: ${[...botIds].join(', ')}`);
});
client.on('auth_failure', (msg) => console.error('❌ Authentication failed:', msg));
client.on('disconnected', (reason) => console.warn('⚠️  Disconnected:', reason));

// Feature 1 — greet new members when they join a group
client.on('group_join', async (notification) => {
  try {
    const chat = await notification.getChat();
    if (!chatAllowed(chat.id?._serialized)) return;
    const mentions = notification.recipientIds || []; // accounts that just joined
    console.log(`[${new Date().toISOString()}] group_join in ${chat.name}: ${mentions.join(', ')}`);
    await chat.sendMessage(`${GREETING} Welcome to the group!`, { mentions });
  } catch (err) {
    console.error('group_join handler error:', err);
  }
});

// Returns true if this message @-mentions the bot itself (matches either its @c.us or @lid id)
function mentionsBot(msg) {
  if (botIds.size === 0 || !Array.isArray(msg.mentionedIds)) return false;
  return msg.mentionedIds.some((id) => botIds.has(id?._serialized || String(id)));
}

// Removes the bot's own @-mention handle(s) from the body, leaving just the user's prompt.
// WhatsApp renders a mention as "@<userpart>" (e.g. @92138123812), so strip that for each bot id.
function stripBotMention(body) {
  let text = body || '';
  for (const id of botIds) {
    const user = id.split('@')[0];
    text = text.split(`@${user}`).join('');
  }
  return text.replace(/\s+/g, ' ').trim();
}

// True if this message is a reply (quote) to a message the bot itself sent.
async function isReplyToBot(msg) {
  if (!msg.hasQuotedMsg) return false;
  try {
    const quoted = await msg.getQuotedMessage();
    return !!quoted?.fromMe;
  } catch {
    return false;
  }
}

// Respond to slash commands (exact match), @mentions of the bot, and replies to the bot's messages
client.on('message', async (msg) => {
  if (!chatAllowed(msg.from)) return;
  const text = (msg.body || '').trim().toLowerCase();

  if (COMMANDS.has(text)) {
    console.log(`[${new Date().toISOString()}] command "${text}" from ${msg.from}`);
    await msg.reply(GREETING);
    return;
  }

  // Engage the LLM when the bot is @-mentioned OR when someone replies to one of its messages.
  if (mentionsBot(msg) || (await isReplyToBot(msg))) {
    const prompt = stripBotMention(msg.body);
    if (!prompt) return; // engaged with no actual text — nothing to ask
    console.log(`[${new Date().toISOString()}] LLM prompt from ${msg.from}: ${prompt}`);

    const chat = await msg.getChat();
    await chat.sendStateTyping();
    try {
      const reply = await llm.ask(msg.from, prompt);
      await msg.reply(reply);
    } catch (err) {
      console.error('LLM error:', err.message);
      await msg.reply(LLM_FALLBACK_MESSAGE);
    } finally {
      await chat.clearState();
    }
  }
});

// Graceful shutdown so the Chromium instance is closed cleanly
const shutdown = async () => {
  console.log('\nShutting down…');
  try { await client.destroy(); } catch (_) { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Remove stale Chromium "singleton" locks left by an unclean shutdown (common in containers: the
// hostname/PID changes between runs, so Chromium thinks the profile is held by another machine and
// refuses to launch). Safe to delete — they're only valid while a Chromium process is actually live.
function clearChromiumLocks() {
  const dataPath = process.env.WA_DATA_PATH || '.wwebjs_auth';
  const sessionDir = path.join(dataPath, `session${CLIENT_ID ? '-' + CLIENT_ID : ''}`);
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.rmSync(path.join(sessionDir, name), { force: true }); } catch { /* ignore */ }
  }
}

clearChromiumLocks();
client.initialize();
