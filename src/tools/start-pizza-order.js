const orders = require('../orders');

module.exports = {
  name: 'start_pizza_order',
  description:
    'Start a fresh group pizza order, discarding any order already in progress in this chat. Use ' +
    'when people want to begin collecting pizza choices, or to scratch the current order and start ' +
    'over. After this the order is empty; people add picks with set_pizza_choice.',
  parameters: {
    type: 'object',
    properties: {
      slices_per_pizza: {
        type: 'integer',
        description: 'How many slices a whole pizza has (drives per-slice price). Default 8.',
      },
      size: {
        type: 'string',
        enum: ['32cm', '42cm'],
        description: 'Which pizza size to price the order at. Default 42cm (large).',
      },
    },
    required: [],
  },
  handler: async ({ slices_per_pizza, size } = {}, { chatId } = {}) => {
    if (!chatId) return { error: 'no chat context available to scope the order' };
    const order = orders.startOrder(chatId, { slicesPerPizza: slices_per_pizza, size });
    return {
      started: true,
      slicesPerPizza: order.slicesPerPizza,
      size: order.size,
      entries: order.entries,
      note: 'Fresh order started. People can now add their pizza slices.',
    };
  },
};
