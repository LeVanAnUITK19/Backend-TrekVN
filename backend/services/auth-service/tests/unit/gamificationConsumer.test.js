jest.mock('amqplib', () => ({ connect: jest.fn() }));
jest.mock('../../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/gamificationEvent.service', () => ({ handleEvent: jest.fn() }));

const amqplib = require('amqplib');
const logger = require('../../src/config/logger');

describe('GamificationConsumer connection failures', () => {
  let consumer;
  let previousEnabled;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    previousEnabled = process.env.RABBITMQ_ENABLED;
    process.env.RABBITMQ_ENABLED = 'true';
    jest.isolateModules(() => {
      consumer = require('../../src/events/consumers/gamification.consumer');
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (previousEnabled === undefined) { delete process.env.RABBITMQ_ENABLED; }
    else { process.env.RABBITMQ_ENABLED = previousEnabled; }
  });

  it('reports both refused addresses when AggregateError.message is empty and retries after 10 seconds', async () => {
    amqplib.connect.mockRejectedValue(new AggregateError([
      new Error('connect ECONNREFUSED ::1:5672'),
      new Error('connect ECONNREFUSED 127.0.0.1:5672'),
    ]));

    await consumer.start();

    expect(logger.error).toHaveBeenCalledWith(
      '[GamificationConsumer] Failed to connect: connect ECONNREFUSED ::1:5672; connect ECONNREFUSED 127.0.0.1:5672'
    );
    expect(amqplib.connect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10000);
    expect(amqplib.connect).toHaveBeenCalledTimes(2);
  });

  it('preserves an ordinary broker error message', async () => {
    amqplib.connect.mockRejectedValue(new Error('ACCESS_REFUSED'));

    await consumer.start();

    expect(logger.error).toHaveBeenCalledWith('[GamificationConsumer] Failed to connect: ACCESS_REFUSED');
  });
});
