jest.mock('../../src/models/EventOutbox');
jest.mock('../../src/events/publishers/trekking.publisher');
const EventOutbox = require('../../src/models/EventOutbox');
const publisher = require('../../src/events/publishers/trekking.publisher');
const { processBatch } = require('../../src/events/publishers/outbox.worker');

afterEach(() => { jest.resetAllMocks(); process.env.RABBITMQ_ENABLED = 'false'; });

test('disabled RabbitMQ leaves outbox events pending', async () => {
  process.env.RABBITMQ_ENABLED = 'false';
  await processBatch();
  expect(EventOutbox.find).not.toHaveBeenCalled();
  expect(EventOutbox.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('missing RabbitMQ channel schedules retry instead of marking event published', async () => {
  process.env.RABBITMQ_ENABLED = 'true';
  const event = { _id: 'event', eventId: 'message', eventType: 'TREKKING_JOURNEY_COMPLETED', retryCount: 0 };
  EventOutbox.find.mockReturnValue({ sort: () => ({ limit: async () => [event] }) });
  EventOutbox.findOneAndUpdate.mockResolvedValue(event);
  EventOutbox.findByIdAndUpdate.mockResolvedValue(event);
  publisher._getChannelForOutbox.mockResolvedValue(null);
  await processBatch();
  expect(EventOutbox.findByIdAndUpdate).toHaveBeenCalledWith('event', {
    $set: expect.objectContaining({ status: 'PENDING', retryCount: 1, lastError: 'RabbitMQ channel unavailable' }),
  });
  expect(EventOutbox.findByIdAndUpdate).not.toHaveBeenCalledWith('event', {
    $set: expect.objectContaining({ status: 'PUBLISHED' }),
  });
});
