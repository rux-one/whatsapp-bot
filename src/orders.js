const fs = require('fs');
const path = require('path');
const { ORDER_SLICES_PER_PIZZA, ORDER_DEFAULT_SIZE } = require('./config');

// Ephemeral, per-group pizza-order state. This is mutable working data (not reference knowledge), so
// it lives in its own JSON store next to the WhatsApp session — mirroring llm.js's chat-history
// persistence — rather than in the OKF knowledge base. Keyed by chatId so each group has one order.
//
// Order shape:
//   { createdAt: ISO, slicesPerPizza: number, size: '32cm'|'42cm',
//     entries: [ { user, pizzaId, pizzaTitle, slices } ] }

const DATA_PATH = process.env.WA_DATA_PATH || '.wwebjs_auth';
const ORDERS_FILE = path.join(DATA_PATH, 'pizza-orders.json');

/** @type {Map<string, object>} chatId -> order */
const orders = loadOrders();

function loadOrders() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'))));
  } catch {
    return new Map(); // missing/corrupt file -> start fresh
  }
}

function saveOrders() {
  try {
    fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(Object.fromEntries(orders), null, 2));
  } catch (err) {
    console.error('Failed to persist pizza orders:', err.message);
  }
}

function getOrder(chatId) {
  return orders.get(chatId) || null;
}

// Scratch any existing order and create a fresh empty one. opts: { slicesPerPizza?, size? }.
function startOrder(chatId, opts = {}) {
  const order = {
    createdAt: new Date().toISOString(),
    slicesPerPizza: Number(opts.slicesPerPizza) > 0 ? Number(opts.slicesPerPizza) : ORDER_SLICES_PER_PIZZA,
    size: opts.size === '32cm' ? '32cm' : ORDER_DEFAULT_SIZE,
    entries: [],
  };
  orders.set(chatId, order);
  saveOrders();
  return order;
}

function cancelOrder(chatId) {
  const existed = orders.delete(chatId);
  saveOrders();
  return existed;
}

// Upsert one person's slices for a pizza. An existing (user, pizzaId) pair is updated in place so a
// person can refine a pick; distinct pizzas create separate entries. Returns the stored entry.
function addEntry(chatId, { user, pizzaId, pizzaTitle, slices }) {
  const order = orders.get(chatId);
  if (!order) return null;
  const existing = order.entries.find(
    (e) => e.user.toLowerCase() === user.toLowerCase() && e.pizzaId === pizzaId
  );
  if (existing) {
    existing.slices = slices;
    existing.pizzaTitle = pizzaTitle;
  } else {
    order.entries.push({ user, pizzaId, pizzaTitle, slices });
  }
  saveOrders();
  return existing || order.entries[order.entries.length - 1];
}

// Remove a user's entries. With pizzaId, removes just that pizza for the user; otherwise removes all
// of the user's picks. Returns the number of entries removed.
function removeEntries(chatId, { user, pizzaId }) {
  const order = orders.get(chatId);
  if (!order) return 0;
  const before = order.entries.length;
  order.entries = order.entries.filter((e) => {
    const sameUser = e.user.toLowerCase() === user.toLowerCase();
    if (!sameUser) return true;
    return pizzaId ? e.pizzaId !== pizzaId : false;
  });
  const removed = before - order.entries.length;
  if (removed) saveOrders();
  return removed;
}

module.exports = {
  getOrder, startOrder, cancelOrder, addEntry, removeEntries, saveOrders,
};
