const orders = require('../orders');

module.exports = {
  name: 'cancel_pizza_order',
  description:
    'Cancel and discard the current group pizza order entirely. Use when people want to scrap the ' +
    'order. To scrap and immediately begin a new one instead, use start_pizza_order.',
  parameters: { type: 'object', properties: {}, required: [] },
  handler: async (_args = {}, { chatId } = {}) => {
    if (!chatId) return { error: 'no chat context available to scope the order' };
    const existed = orders.cancelOrder(chatId);
    return existed
      ? { cancelled: true, note: 'Order scrapped.' }
      : { cancelled: false, note: 'There was no order to cancel.' };
  },
};
