const orders = require('../orders');
const { findPizza } = require('../pizza-data');

module.exports = {
  name: 'set_pizza_choice',
  description:
    "Add or update a person's pizza choice in the current group order: how many slices of which " +
    'pizza they want. Calling it again for the same person and pizza updates their slice count. ' +
    "The person's name is filled in automatically from who sent the message — only pass `user` when " +
    'ordering on someone else\'s behalf. If no order is in progress, one is started automatically.',
  parameters: {
    type: 'object',
    properties: {
      pizza: {
        type: 'string',
        description: 'Name of the pizza (as on the menu), e.g. "Margherita". Required.',
      },
      slices: {
        type: 'integer',
        description: 'How many slices this person wants of this pizza. Required, must be > 0.',
      },
      user: {
        type: 'string',
        description: "Whose choice this is. Omit to use the sender's own name.",
      },
    },
    required: ['pizza', 'slices'],
  },
  handler: async ({ pizza, slices, user } = {}, { chatId, senderName } = {}) => {
    if (!chatId) return { error: 'no chat context available to scope the order' };
    if (!pizza) return { error: 'which pizza? a pizza name is required' };

    const n = Number(slices);
    if (!Number.isInteger(n) || n <= 0) {
      return { error: 'slices must be a whole number greater than 0' };
    }

    const who = (user && String(user).trim()) || senderName;
    if (!who) return { error: 'could not determine whose choice this is' };

    const match = findPizza(pizza);
    if (!match) {
      return { error: `no pizza matched "${pizza}". Check the menu with list_pizzas.` };
    }

    if (!orders.getOrder(chatId)) orders.startOrder(chatId);
    const entry = orders.addEntry(chatId, {
      user: who,
      pizzaId: match.id,
      pizzaTitle: match.title,
      slices: n,
    });

    return { saved: true, entry };
  },
};
