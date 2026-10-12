const { errorHandler } = require('../../src/middlewares/errorHandler');

it('explains a compound milestone route/sequence conflict using the sequence field', () => {
  const req = { headers: {}, path: '/api/v1/admin/trekking/routes/route/milestones', method: 'POST' };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  errorHandler({ code: 11000, keyValue: { trekkingRouteId: 'route', sequence: 1 } }, req, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    error: {
      code: 'MILESTONE_SEQUENCE_CONFLICT',
      message: 'Thứ tự 1 đã có cột mốc trong cung đường này. Hãy chọn thứ tự khác.',
      details: { field: 'sequence', sequence: 1, routeId: 'route' },
    },
  }));
});

it('preserves the generic duplicate response for unrelated unique indexes', () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  errorHandler({ code: 11000, keyValue: { code: 'badge' } }, { headers: {} }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json.mock.calls[0][0].error.code).toBe('CONFLICT');
});
