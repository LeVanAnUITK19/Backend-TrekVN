const { deliver } = require('../../src/events/publishers/http.delivery');
const Outbox = require('../../src/models/EventOutbox');
jest.mock('../../src/models/EventOutbox');
const { processBatch } = require('../../src/events/publishers/outbox.worker');
const originalFetch = global.fetch;
beforeEach(() => {
  process.env.GAMIFICATION_HTTP_ENABLED = 'true';
  process.env.TREKVIET_INTERNAL_TOKEN = 'test-service-token';
});
afterEach(() => {
  global.fetch = originalFetch; jest.resetAllMocks();
  delete process.env.GAMIFICATION_HTTP_ENABLED; delete process.env.TREKVIET_INTERNAL_TOKEN;
});
const ok = () => ({ ok: true, json: async () => ({ success: true }) });
test('partial delivery throws; retry reuses the same receipt at both consumers', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValue(ok());
  const event = { eventId: 'receipt', eventType: 'CHECKIN_VERIFIED', payload: { userId: 'user' } };
  await expect(deliver(event)).rejects.toThrow('503');
  await deliver(event);
  expect(global.fetch).toHaveBeenCalledTimes(4);
  for (const [, request] of global.fetch.mock.calls) {
    expect(JSON.parse(request.body).eventId).toBe('receipt');
    expect(request.headers['X-Service-Token']).toBe('test-service-token');
  }
});
test.each([[true, 0], [false, 0], [false, 12]])('worker acknowledges only successful HTTP deliveries (%s, retry %s)', async (success, retryCount) => {
  global.fetch = jest.fn().mockResolvedValue(success ? ok() : { ok: false, status: 503 });
  const event = { _id: 'event', eventId: 'receipt', eventType: 'CHECKIN_VERIFIED', payload: { userId: 'user' }, retryCount };
  Outbox.find.mockReturnValue({ sort: () => ({ limit: async () => [event] }) });
  Outbox.findOneAndUpdate.mockResolvedValue(event);
  Outbox.findByIdAndUpdate.mockResolvedValue(event);
  await processBatch();
  expect(Outbox.findByIdAndUpdate).toHaveBeenCalledWith('event', {
    $set: expect.objectContaining({ status: success ? 'PUBLISHED' : 'PENDING' }),
  });
  expect(Outbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ status: 'PROCESSING' }), expect.any(Object));
});
