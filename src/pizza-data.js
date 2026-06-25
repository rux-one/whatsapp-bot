const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { PIZZA_DIR } = require('./config');

// Reads the OKF pizza bundle from PIZZA_DIR. Each non-reserved `<id>.md` is one pizza; the OKF
// concept id is the filename minus `.md`. Frontmatter (type/title/description/tags/price/toppings)
// is the structured data we return; `index.md` is the reserved OKF index and is skipped.
// Shared by the menu tool (list_pizzas) and the pizza-order tools so price/lookup logic lives once.
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
      price_32cm: data.price_32cm ?? data.price ?? null,
      price_42cm: data.price_42cm ?? null,
      currency: data.currency || 'PLN',
      toppings: data.toppings || [],
      tags: data.tags || [],
    };
  });
}

// Resolve a free-text pizza reference (as the model/user phrases it) to a single pizza, or null.
// Tries, in order: exact id, exact title, then a loose "contains" match (query in title or vice
// versa). Case-insensitive throughout. A loose match only resolves when it's unambiguous (exactly
// one candidate) so "specjalna" doesn't silently pick the wrong "Specjalna 12".
function findPizza(query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  if (!q) return null;
  const pizzas = readPizzas();

  const exact = pizzas.find((p) => p.id.toLowerCase() === q || p.title.toLowerCase() === q);
  if (exact) return exact;

  const loose = pizzas.filter((p) => {
    const t = p.title.toLowerCase();
    return t.includes(q) || q.includes(t);
  });
  return loose.length === 1 ? loose[0] : null;
}

// Price for a pizza at a given size ("32cm" | "42cm"), or null when unknown.
function priceForSize(pizza, size) {
  if (!pizza) return null;
  return size === '32cm' ? pizza.price_32cm : pizza.price_42cm;
}

module.exports = { readPizzas, findPizza, priceForSize };
