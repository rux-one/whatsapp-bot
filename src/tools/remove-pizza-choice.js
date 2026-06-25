const orders = require('../orders');
const { findPizza } = require('../pizza-data');

module.exports = {
  name: 'remove_pizza_choice',
  description:
    "Remove a person's pizza choice from the current group order — when they change their mind. " +
    'Omit `pizza` to remove all of that person\'s picks. The name is filled in automatically from ' +
    'who sent the message — only pass `user` when removing on someone else\'s behalf.',
  parameters: {
    type: 'object',
    properties: {
      pizza: {
        type: 'string',
        description: 'Which pizza to remove for this person. Omit to remove all their picks.',
      },
      user: {
        type: 'string',
        description: "Whose choice to remove. Omit to use the sender's own name.",
      },
    },
    required: [],
  },
  handler: async ({ pizza, user } = {}, { chatId, senderName } = {}) => {
    if (!chatId) return { error: 'no chat context available to scope the order' };
    if (!orders.getOrder(chatId)) return { error: 'no pizza order is in progress' };

    const who = (user && String(user).trim()) || senderName;
    if (!who) return { error: 'could not determine whose choice to remove' };

    let pizzaId;
    if (pizza) {
      const match = findPizza(pizza);
      if (!match) return { error: `no pizza matched "${pizza}".` };
      pizzaId = match.id;
    }

    const removed = orders.removeEntries(chatId, { user: who, pizzaId });
    if (removed === 0) {
      return { removed: 0, note: `nothing to remove for ${who}${pizza ? ` (${pizza})` : ''}.` };
    }
    return { removed, user: who };
  },
};
