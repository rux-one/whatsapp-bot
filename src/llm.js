const fs = require('fs');
const path = require('path');

// --- Config ---
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';
const MAX_HISTORY = 20; // number of user/assistant turns kept per chat (system prompt is extra)

// System prompt — the whole AGENT.md file becomes the system message. Loaded once at startup.
const SYSTEM_PROMPT = fs
  .readFileSync(path.join(__dirname, '..', 'prompts', 'AGENT.md'), 'utf8')
  .trim();

// History persisted alongside the WhatsApp session so it survives restarts/redeploys.
const DATA_PATH = process.env.WA_DATA_PATH || '.wwebjs_auth';
const HISTORY_FILE = path.join(DATA_PATH, 'chat-history.json');

/** @type {Map<string, Array<{role:string, content:string}>>} chatId -> messages */
const histories = loadHistories();

function loadHistories() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map(); // missing/corrupt file -> start fresh
  }
}

function saveHistories() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(histories), null, 2));
  } catch (err) {
    console.error('Failed to persist chat history:', err.message);
  }
}

/**
 * Send a user message to Ollama within the chat's running conversation and return the reply.
 * History is shared per chat and capped to the last MAX_HISTORY turns; the system prompt is
 * always prepended. On failure the user turn is rolled back so history stays clean.
 * @param {string} chatId
 * @param {string} userText
 * @returns {Promise<string>}
 */
async function ask(chatId, userText) {
  const history = histories.get(chatId) || [];
  history.push({ role: 'user', content: userText });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY),
  ];

  let reply;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    reply = (data.message?.content || '').trim();
    if (!reply) throw new Error('Ollama returned an empty response');
  } catch (err) {
    history.pop(); // roll back the user turn we optimistically added
    if (history.length) histories.set(chatId, history);
    throw err;
  }

  history.push({ role: 'assistant', content: reply });
  // Keep only the most recent turns in memory and on disk.
  histories.set(chatId, history.slice(-MAX_HISTORY));
  saveHistories();
  return reply;
}

module.exports = { ask };
