'use strict';
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { validate, validateIds } = require('../validators/community.validator');
const schemas = require('../validators/admin.validator');
function createAdminRoutes(service) {
  const router = Router();
  const wrap = (fn) => async (req, res, next) => {
    try { res.json({ success: true, data: await fn(req) }); } catch (err) { next(err); }
  };
  router.use(authenticate, requireAdmin);
  router.param('postId', (req, res, next) => validateIds(req, res, next));
  router.param('commentId', (req, res, next) => validateIds(req, res, next));
  router.get('/posts', validate(schemas.posts, 'query'), wrap((r) => service.listPosts(r.user.userId, r.query)));
  router.get('/posts/:postId', wrap((r) => service.getPost(r.user.userId, r.params.postId)));
  router.get('/comments', validate(schemas.comments, 'query'), wrap((r) => service.listComments(r.query)));
  router.patch('/posts/:postId/hide', validate(schemas.moderation), wrap((r) => service.moderatePost(r.user.userId, r.params.postId, 'HIDE', r.body.reason)));
  router.patch('/posts/:postId/publish', validate(schemas.moderation), wrap((r) => service.moderatePost(r.user.userId, r.params.postId, 'PUBLISH', r.body.reason)));
  router.delete('/posts/:postId', validate(schemas.moderation), wrap((r) => service.moderatePost(r.user.userId, r.params.postId, 'DELETE', r.body.reason)));
  router.patch('/comments/:commentId/hide', validate(schemas.moderation), wrap((r) => service.moderateComment(r.user.userId, r.params.commentId, 'HIDE', r.body.reason)));
  router.patch('/comments/:commentId/publish', validate(schemas.moderation), wrap((r) => service.moderateComment(r.user.userId, r.params.commentId, 'PUBLISH', r.body.reason)));
  router.delete('/comments/:commentId', validate(schemas.moderation), wrap((r) => service.moderateComment(r.user.userId, r.params.commentId, 'DELETE', r.body.reason)));
  return router;
}
module.exports = { createAdminRoutes };
