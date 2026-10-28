'use strict';
function createController(service) {
  const wrap = (fn, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await fn(req) }); }
    catch (err) { next(err); }
  };
  return {
    listPosts: wrap((r) => service.listPosts(r.user.userId, r.query)),
    getPost: wrap((r) => service.getPost(r.user.userId, r.params.postId)),
    createPost: wrap((r) => service.createPost(r.user.userId, r.body, r.get('authorization')), 201),
    updatePost: wrap((r) => service.updatePost(r.user.userId, r.params.postId, r.body, r.get('authorization'))),
    deletePost: wrap((r) => service.deletePost(r.user.userId, r.params.postId)),
    likePost: wrap((r) => service.setPostLike(r.user.userId, r.params.postId, r.method !== 'DELETE')),
    listComments: wrap((r) => service.listComments(r.user.userId, r.params.postId, r.query)),
    createComment: wrap((r) => service.createComment(r.user.userId, r.params.postId, r.body), 201),
    updateComment: wrap((r) => service.updateComment(r.user.userId, r.params.commentId, r.body)),
    deleteComment: wrap((r) => service.deleteComment(r.user.userId, r.params.commentId)),
    likeComment: wrap((r) => service.setCommentLike(r.user.userId, r.params.commentId, r.method !== 'DELETE')),
  };
}
module.exports = { createController };
