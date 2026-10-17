'use strict';
const authenticateService = (req, res, next) => {
  const expected = process.env.TREKVIET_INTERNAL_TOKEN || process.env.SERVICE_TOKEN;
  if (!expected || req.headers['x-service-token'] !== expected) {
    return res.status(403).json({ success: false, message: 'Invalid service token' });
  }
  next();
};
module.exports = { authenticateService };
