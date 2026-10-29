'use strict';
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const { currentSession } = require('../middlewares/currentSession');
const { validate, validateIds } = require('../validators/community.validator');
const s = require('../validators/social.validator');
const wrap = fn => async (req, res, next) => {
  try { res.json({ success: true, data: await fn(req) }); } catch (err) { next(err); }
};
function createSocialRoutes(service) {
  const router = Router();
  router.use(authenticate, currentSession);
  for (const param of ['userId', 'conversationId', 'messageId']) router.param(param, (req, res, next) => validateIds(req, res, next));
  router.get('/people/me', wrap(r => service.profile(r.user.userId, r.user.userId)));
  router.patch('/people/me', validate(s.profile), wrap(r => service.updateProfile(r.user.userId, r.body)));
  router.post('/people/me/qr', wrap(r => service.rotateQr(r.user.userId)));
  router.get('/people/discover', validate(s.discovery, 'query'), wrap(r => service.discover(r.user.userId, r.query)));
  router.get('/people/:userId', wrap(r => service.profile(r.user.userId, r.params.userId)));
  router.get('/conversations', validate(s.page, 'query'), wrap(r => service.conversations(r.user.userId, r.query)));
  router.post('/conversations/direct', validate(s.direct), wrap(r => service.direct(r.user.userId, r.body.userId)));
  router.post('/conversations/groups', validate(s.group), wrap(r => service.group(r.user.userId, r.body)));
  router.get('/conversations/:conversationId', wrap(r => service.conversation(r.user.userId, r.params.conversationId)));
  router.patch('/conversations/:conversationId', validate(s.groupEdit), wrap(r => service.editGroup(r.user.userId, r.params.conversationId, r.body)));
  router.post('/conversations/:conversationId/members', validate(s.member), wrap(r => service.membership(r.user.userId, r.params.conversationId, r.body.userId, true)));
  router.delete('/conversations/:conversationId/members/:userId', wrap(r => service.membership(r.user.userId, r.params.conversationId, r.params.userId, false)));
  router.get('/conversations/:conversationId/messages', validate(s.messages, 'query'), wrap(r => service.messages(r.user.userId, r.params.conversationId, r.query)));
  router.post('/conversations/:conversationId/messages', validate(s.message), wrap(r => service.send(r.user.userId, r.params.conversationId, r.body)));
  router.post('/conversations/:conversationId/read', validate(s.read), wrap(r => service.read(r.user.userId, r.params.conversationId, r.body.sequence)));
  router.delete('/conversations/:conversationId/messages/:messageId', wrap(r => service.removeMessage(r.user.userId, r.params.conversationId, r.params.messageId)));
  router.post('/conversations/:conversationId/messages/:messageId/report', validate(s.reason), wrap(r => service.report(r.user.userId, r.params.conversationId, r.params.messageId, r.body.reason)));
  return router;
}
module.exports = { createSocialRoutes };
