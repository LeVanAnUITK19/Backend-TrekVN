'use strict';
const { Router } = require('express');
const { authenticate } = require('../middlewares/auth');
const v = require('../validators/community.validator');
const { createController } = require('../controllers/community.controller');
function createRoutes(service) {
  const router = Router();
  const c = createController(service);
  router.use(authenticate);
  // Parameter middleware runs for every nested resource route as well.
  router.param('postId', (req, res, next) => v.validateIds(req, res, next));
  router.param('commentId', (req, res, next) => v.validateIds(req, res, next));
  router.get('/posts', v.validate(v.query, 'query'), c.listPosts);
  router.post('/posts', v.validate(v.post), c.createPost);
  router.get('/posts/:postId', c.getPost);
  router.put('/posts/:postId', v.validate(v.editPost), c.updatePost);
  router.patch('/posts/:postId', v.validate(v.editPost), c.updatePost);
  router.delete('/posts/:postId', c.deletePost);
  router.post('/posts/:postId/like', c.likePost);
  router.delete('/posts/:postId/like', c.likePost);
  router.get('/posts/:postId/comments', v.validate(v.commentQuery, 'query'), c.listComments);
  router.post('/posts/:postId/comments', v.validate(v.comment), c.createComment);
  router.put('/comments/:commentId', v.validate(v.editComment), c.updateComment);
  router.patch('/comments/:commentId', v.validate(v.editComment), c.updateComment);
  router.delete('/comments/:commentId', c.deleteComment);
  router.post('/comments/:commentId/like', c.likeComment);
  router.delete('/comments/:commentId/like', c.likeComment);
  return router;
}
module.exports = { createRoutes };
