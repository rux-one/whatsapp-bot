const fs = require('fs');
const path = require('path');

// --- Tool registry -----------------------------------------------------------------------------
// Every file in this directory (except this one) is a tool module exporting:
//   { name, description, parameters /* JSON Schema */, handler(args) -> JSON-serializable result }
// To add a tool: drop a new file here. No edits to this file or the loop are needed.

function loadTools() {
  const dir = __dirname;
  const registry = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (file === 'index.js' || !file.endsWith('.js')) continue;
    const tool = require(path.join(dir, file));
    if (!tool?.name || typeof tool.handler !== 'function') {
      console.warn(`Skipping ${file}: not a valid tool module (need { name, handler }).`);
      continue;
    }
    registry.set(tool.name, tool);
  }
  return registry;
}

const registry = loadTools();

// Definitions in the shape Ollama's /api/chat expects under the `tools` key.
const definitions = [...registry.values()].map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description || '',
    parameters: t.parameters || { type: 'object', properties: {} },
  },
}));

// Run a tool by name. Never throws: a failing tool returns { error } so the model can see what
// went wrong and recover instead of crashing the loop.
async function dispatch(name, args) {
  const tool = registry.get(name);
  if (!tool) return { error: `unknown tool: ${name}` };
  try {
    return await tool.handler(args || {});
  } catch (err) {
    return { error: `${name} failed: ${err.message}` };
  }
}

const names = [...registry.keys()];

module.exports = { definitions, dispatch, names };
