const orders = require('../orders');
const { readPizzas, priceForSize } = require('../pizza-data');

module.exports = {
  name: 'pizza_order_status',
  description:
    'Show the current state of the group pizza order: the selected pizzas (with total slices and ' +
    'price-per-slice), how many slices each person signed up for, and — when prices are known — the ' +
    'total cost and each person\'s share. Always use this to report the order; never guess the numbers.',
  parameters: { type: 'object', properties: {}, required: [] },
  handler: async (_args = {}, { chatId } = {}) => {
    if (!chatId) return { error: 'no chat context available to scope the order' };
    const order = orders.getOrder(chatId);
    if (!order) return { active: false, note: 'No pizza order is in progress. Start one to begin.' };

    const { slicesPerPizza, size, entries } = order;
    const priceById = new Map(readPizzas().map((p) => [p.id, priceForSize(p, size)]));

    // Per-pizza aggregation: total slices and per-slice price (null when the pizza has no price).
    const pizzaMap = new Map();
    for (const e of entries) {
      const cur = pizzaMap.get(e.pizzaId) || { pizzaTitle: e.pizzaTitle, totalSlices: 0 };
      cur.totalSlices += e.slices;
      pizzaMap.set(e.pizzaId, cur);
    }
    let allPriced = true;
    const pizzas = [...pizzaMap.entries()].map(([id, p]) => {
      const price = priceById.get(id);
      const pricePerSlice = price != null ? round2(price / slicesPerPizza) : null;
      if (pricePerSlice == null) allPriced = false;
      return { pizza: p.pizzaTitle, totalSlices: p.totalSlices, pricePerSlice };
    });

    // Per-user aggregation: total slices and cost (sum of slices × that pizza's per-slice price).
    const userMap = new Map();
    let total = 0;
    for (const e of entries) {
      const price = priceById.get(e.pizzaId);
      const cost = price != null ? (price / slicesPerPizza) * e.slices : null;
      const cur = userMap.get(e.user) || { user: e.user, slices: 0, cost: 0, priced: true };
      cur.slices += e.slices;
      if (cost == null) cur.priced = false;
      else cur.cost += cost;
      userMap.set(e.user, cur);
      if (cost != null) total += cost;
    }
    const users = [...userMap.values()].map((u) => ({
      user: u.user,
      slices: u.slices,
      cost: u.priced ? round2(u.cost) : null,
    }));

    return {
      active: true,
      size,
      slicesPerPizza,
      currency: 'PLN',
      pizzas,
      users,
      totalCost: entries.length && allPriced ? round2(total) : null,
      allPriced,
      note: entries.length === 0
        ? 'Order is empty — no choices yet.'
        : allPriced ? undefined : 'Some pizzas have no price for this size, so totals are partial.',
    };
  },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}
