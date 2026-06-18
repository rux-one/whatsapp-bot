const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { EVENTS_DIR } = require('../config');

const MAX_FULL_RESULTS = 3; // above this, return metadata only and ask to narrow down

function readEvents() {
  return fs
    .readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'index.md' && f !== 'log.md')
    .map((file) => {
      const raw = fs.readFileSync(path.join(EVENTS_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      return {
        id: file.replace(/\.md$/, ''),
        title: data.title || file.replace(/\.md$/, ''),
        description: data.description || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        timestamp: data.timestamp || null,
        number: data.number ?? null,
        series: data.series || null,
        body: content.trim(),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1)); // chronological by YYYY-MM-DD filename
}

function matchesQuery(event, query) {
  const q = query.toLowerCase();
  return [event.title, event.description, event.tags.join(' '), event.body]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

module.exports = {
  name: 'list_events',
  description:
    'Search the AI Jam Łódź meetup history and return full notes for matching events. ' +
    'Use this whenever the user asks about what was discussed, shown, or linked at a meetup. ' +
    'Provide at least one filter so only the relevant event(s) load into context: ' +
    '`date` for a specific event ("2025-04-10"), month ("2025-04"), or year ("2025"); ' +
    '`number` for the meetup number (e.g. 7); ' +
    '`query` for a keyword appearing in titles, tags, or notes (e.g. "MCP", "RAG", "Docling").',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Keyword to search across event titles, descriptions, tags and body notes. ' +
          'Case-insensitive substring match.',
      },
      date: {
        type: 'string',
        description:
          'Date filter matched against the event filename (YYYY-MM-DD). ' +
          'Accepts full date "2025-04-10", month prefix "2025-04", or year "2025".',
      },
      number: {
        type: 'integer',
        description: 'Official meetup number, e.g. 7 for AI Jam Łódź #7.',
      },
    },
    required: [],
  },
  handler: async ({ query, date, number } = {}) => {
    let events = readEvents();

    if (number !== undefined && number !== null) {
      events = events.filter((e) => e.number === Number(number));
    }

    if (date) {
      events = events.filter((e) => e.id.startsWith(String(date)));
    }

    if (query) {
      events = events.filter((e) => matchesQuery(e, String(query)));
    }

    const hasFilter = query || date || number !== undefined;

    if (!hasFilter) {
      // No filters: return the listing without bodies to keep context lean.
      return {
        count: events.length,
        note: 'Listing only — use date, number or query to load full notes for a specific event.',
        events: events.map(({ id, title, description, tags, timestamp, number }) => ({
          id, title, description, tags, timestamp, number,
        })),
      };
    }

    if (events.length > MAX_FULL_RESULTS) {
      return {
        count: events.length,
        note: `Too many results (${events.length}) for full notes. Narrow the search with a more specific query, date or number.`,
        events: events.map(({ id, title, description, tags, timestamp, number }) => ({
          id, title, description, tags, timestamp, number,
        })),
      };
    }

    return { count: events.length, events };
  },
};
