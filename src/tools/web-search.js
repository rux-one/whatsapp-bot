const { BRAVE_API_KEY } = require('../config');

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

module.exports = {
  name: 'web_search',
  description:
    'Search the web for current or external information (news, facts, weather, anything not in ' +
    'the local pizza menu). Returns the top results with titles, URLs and snippets.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
      count: { type: 'integer', description: 'How many results to return (1-10, default 5).' },
    },
    required: ['query'],
  },
  handler: async ({ query, count = 5 } = {}) => {
    if (!query) return { error: 'web_search requires a non-empty "query".' };
    if (!BRAVE_API_KEY) return { error: 'web search unavailable: BRAVE_API_KEY not set' };

    const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${Math.min(Math.max(count, 1), 10)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_API_KEY },
    });
    if (!res.ok) {
      throw new Error(`Brave API ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const results = (data.web?.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));
    return { query, count: results.length, results };
  },
};
