const fs = require('fs');
const path = require('path');
const { OLLAMA_URL, OLLAMA_MODEL, MAX_TOOL_ITERS, MAX_INPUT_LIMIT } = require('./config');
const tools = require('./tools');

const MAX_HISTORY = 20; // number of user/assistant turns kept per chat (system prompt is extra)

// System prompt = SOUL.md (personality/voice) followed by SYSTEM.md (operational tool rules), loaded
// once at startup. SOUL goes first so the assistant's identity frames how it applies the rules.
// (prompts/AGENT.md — the meetup knowledge base — is intentionally NOT loaded this iteration; it will
// be transformed into OKF docs next time.)
const PROMPT_DIR = path.join(__dirname, '..', 'prompts');
const SYSTEM_PROMPT = ['SOUL.md', 'SYSTEM.md']
  .map((f) => fs.readFileSync(path.join(PROMPT_DIR, f), 'utf8').trim())
  .join('\n\n');

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

// One round-trip to Ollama. Offers the tool definitions every turn so the model can call them.
async function ollamaChat(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools: tools.definitions, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.message) throw new Error('Ollama returned no message');
  return data.message; // { role, content, tool_calls? }
}

/**
 * Send a user message to Ollama within the chat's running conversation and return the reply.
 * Runs the tool-calling loop: the model may call tools (pizza menu, web search), whose results are
 * fed back until it produces a plain-text answer. History is shared per chat and capped to the last
 * MAX_HISTORY turns; the system prompt is always prepended. Only the user message and the final
 * assistant text are persisted (intermediate tool messages are dropped, keeping context clean). On
 * failure nothing is persisted and the error propagates (bot.js then sends LLM_FALLBACK_MESSAGE).
 * If any tools were used, a "🔧 <names>" marker is appended to the returned reply (but not stored).
 * @param {string} chatId
 * @param {string} userText
 * @returns {Promise<string>}
 */
async function ask(chatId, userText) {
  // Guardrail: trim oversized input so a huge message can't blow up the prompt/context.
  if (userText.length > MAX_INPUT_LIMIT) {
    console.warn(`Input from ${chatId} trimmed: ${userText.length} -> ${MAX_INPUT_LIMIT} chars`);
    userText = userText.slice(0, MAX_INPUT_LIMIT);
  }

  const history = histories.get(chatId) || [];
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-MAX_HISTORY),
    { role: 'user', content: userText },
  ];

  const toolsUsed = [];
  let reply = null;

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const message = await ollamaChat(messages);
    messages.push(message);

    const calls = message.tool_calls || [];
    if (calls.length === 0) {
      reply = (message.content || '').trim();
      break;
    }

    for (const call of calls) {
      const { name, arguments: args } = call.function || {};
      const result = await tools.dispatch(name, args);
      toolsUsed.push(name);
      const preview = JSON.stringify(result);
      console.log(`[${new Date().toISOString()}] 🔧 ${name}(${JSON.stringify(args || {})})`);
      messages.push({ role: 'tool', tool_name: name, content: preview });
    }
  }

  if (reply === null) {
    throw new Error(`Tool loop did not converge within ${MAX_TOOL_ITERS} iterations`);
  }
  if (!reply) throw new Error('Ollama returned an empty response');

  // Persist only the user turn and the final assistant text — not the system prompt or the
  // intermediate tool/assistant messages — so stored context stays clean and within the cap.
  history.push({ role: 'user', content: userText });
  history.push({ role: 'assistant', content: reply });
  histories.set(chatId, history.slice(-MAX_HISTORY));
  saveHistories();

  // Append the tool-usage marker after persisting so it never pollutes stored history.
  if (toolsUsed.length) {
    reply += `\n\n🔧 ${[...new Set(toolsUsed)].join(', ')}`;
  }
  return reply;
}

module.exports = { ask };
