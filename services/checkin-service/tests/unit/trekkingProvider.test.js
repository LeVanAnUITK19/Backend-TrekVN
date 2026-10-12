const http = require('http');
const {
  getTrekkingProviderInstance,
  resetTrekkingProviderInstance,
} = require('../../src/providers/trekking');

describe('TrekkingProvider with real milestone metadata', () => {
  let server;
  const originalProvider = process.env.TREKKING_PROVIDER;
  const originalUrl = process.env.TREKKING_SERVICE_URL;
  const context = {
    milestoneId: '6acb37dcd148833590bd8210',
    name: 'Tòa AH1',
    location: { type: 'Point', coordinates: [106.8087, 10.8821] },
    checkinRadiusMeters: 500,
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === `/internal/v1/milestones/${context.milestoneId}/checkin-context`) {
        res.end(JSON.stringify({ success: true, data: context }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ success: false }));
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.TREKKING_SERVICE_URL = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    delete process.env.TREKKING_PROVIDER;
    resetTrekkingProviderInstance();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env.TREKKING_PROVIDER = originalProvider;
    if (originalUrl === undefined) {delete process.env.TREKKING_SERVICE_URL;}
    else {process.env.TREKKING_SERVICE_URL = originalUrl;}
    resetTrekkingProviderInstance();
  });

  it('defaults to HTTP and resolves a milestone absent from mock fixtures', async () => {
    const provider = getTrekkingProviderInstance();
    await expect(provider.getMilestoneCheckinContext(context.milestoneId)).resolves.toEqual(context);
  });

  it('returns null only when trekking-service reports the milestone missing', async () => {
    await expect(getTrekkingProviderInstance().getMilestoneCheckinContext('missing')).resolves.toBeNull();
  });

  it('retains the explicit mock provider for isolated tests', async () => {
    process.env.TREKKING_PROVIDER = 'mock';
    const provider = getTrekkingProviderInstance();
    expect(provider.constructor.name).toBe('MockTrekkingProvider');
    await expect(provider.getMilestoneCheckinContext(context.milestoneId)).resolves.toBeNull();
  });
});
