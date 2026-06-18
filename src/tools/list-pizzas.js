const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { PIZZA_DIR } = require('../config');

// Reads the OKF pizza bundle from PIZZA_DIR. Each non-reserved `<id>.md` is one pizza; the OKF
// concept id is the filename minus `.md`. Frontmatter (type/title/description/tags/price/toppings)
// is the structured data we return; `index.md` is the reserved OKF index and is skipped.
function readPizzas() {
  const files = fs
    .readdirSync(PIZZA_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'index.md');

  return files.map((file) => {
    const id = file.replace(/\.md$/, '');
    const { data } = matter(fs.readFileSync(path.join(PIZZA_DIR, file), 'utf8'));
    return {
      id,
      title: data.title || id,
      description: data.description || '',
      price: data.price ?? null,
      toppings: data.toppings || [],
      tags: data.tags || [],
    };
  });
}

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
