'use strict';
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { validate, validateIds } = require('../validators/community.validator');
const s = require('../validators/social.validator');
const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, data: await fn(req) }); } catch (err) { next(err); }
};
function createSocialAdminRoutes(service) {
  const router = Router(); router.use(authenticate, requireAdmin);
  for (const param of ['conversationId', 'reportId']) router.param(param, (req, res, next) => validateIds(req, res, next));
  router.get('/groups', validate(s.adminGroups, 'query'), wrap(r => service.adminGroups(r.query)));
  router.patch('/groups/:conversationId/disable', validate(s.reason), wrap(r => service.moderateGroup(r.user.userId, r.params.conversationId, true, r.body.reason)));
  router.patch('/groups/:conversationId/enable', validate(s.reason), wrap(r => service.moderateGroup(r.user.userId, r.params.conversationId, false, r.body.reason)));
  router.get('/message-reports', validate(s.reports, 'query'), wrap(r => service.reports(r.query)));
  router.patch('/message-reports/:reportId', validate(s.resolve), wrap(r => service.resolveReport(r.user.userId, r.params.reportId, r.body)));
  return router;
}
module.exports = { createSocialAdminRoutes };
