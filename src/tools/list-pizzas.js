const { readPizzas } = require('../pizza-data');

module.exports = {
  name: 'list_pizzas',
  description:
    'List the pizzas available on the menu, with prices, toppings and tags. Use this to answer ' +
    'any question about what pizzas exist, their ingredients, or how much they cost.',
  parameters: {
    type: 'object',
    properties: {
      tag: {
        type: 'string',
        description:
          'Optional tag to filter by, e.g. "vegetarian" or "spicy". Omit to list every pizza.',
      },
    },
    required: [],
  },
  handler: async ({ tag } = {}) => {
    let pizzas = readPizzas();
    if (tag) {
      const want = String(tag).toLowerCase();
      pizzas = pizzas.filter((p) => p.tags.map((t) => String(t).toLowerCase()).includes(want));
    }
    return { count: pizzas.length, pizzas };
  },
};
