require('dotenv').config();
const path = require('path');

// Ollama server base URL. Keeps the bot's existing OLLAMA_URL var. Trailing slashes trimmed so we
// can safely append `/api/chat`.
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');

// Model driving the conversation. Must support tool calling for the tools to actually fire.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:12b';

// Brave Search API token. Optional — web_search degrades gracefully when unset.
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';

// OKF pizza bundle directory (the list_pizzas tool's data store). Absolute so it resolves
// regardless of cwd; defaults to ../knowledge/pizza relative to this file.
const PIZZA_DIR = path.resolve(process.env.PIZZA_DIR || path.join(__dirname, '..', 'knowledge', 'pizza'));

// Safety cap on the tool-call loop per turn so a misbehaving model can't spin forever.
const MAX_TOOL_ITERS = Number(process.env.MAX_TOOL_ITERS || 5);

// Guardrail: max characters of user input forwarded to the model. Longer messages are trimmed so a
// huge paste can't blow up the prompt/context. 4000 chars comfortably covers normal chat messages.
const MAX_INPUT_LIMIT = Number(process.env.MAX_INPUT_LIMIT || 4000);

module.exports = { OLLAMA_URL, OLLAMA_MODEL, BRAVE_API_KEY, PIZZA_DIR, MAX_TOOL_ITERS, MAX_INPUT_LIMIT };
