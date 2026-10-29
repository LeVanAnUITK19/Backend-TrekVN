'use strict';
const mongoose = require('mongoose');
const { Post, Comment, Reaction, CommentReaction, ModerationLog } = require('../models');
const repo = require('../repositories/community.repository');
const { hydratePosts } = require('./community.service');
const { lookupUsers } = require('../providers/context.provider');
const { AppError, notFound } = require('../utils/errors');

const statusOf = (item) => item.deleted ? 'DELETED' : item.hidden ? 'HIDDEN' : 'ACTIVE';
function moderationFields(item) {
  return { status: statusOf(item), moderationReason: item.moderationReason || null,
    moderatedBy: item.moderatedBy || null, moderatedAt: item.moderatedAt || null };
}
function filterFor(query, isComment = false) {
  const filter = {};
  if (query.status === 'DELETED') filter.deleted = true;
  if (query.status === 'HIDDEN') { filter.deleted = false; filter.hidden = true; }
  if (query.status === 'ACTIVE') { filter.deleted = false; filter.hidden = { $ne: true }; }
  if (query.authorId) filter.authorId = query.authorId;
  if (isComment && query.postId) filter.postId = query.postId;
  if (!isComment && query.visibility) filter.visibility = query.visibility;
  if (!isComment && query.type) filter.type = query.type;
  if (query.search) {
    const literal = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ content: { $regex: literal, $options: 'i' } }];
    if (/^[a-fA-F0-9]{24}$/.test(query.search)) filter.$or.push({ _id: query.search });
  }
  return filter;
}
async function postsDto(items, userId) {
  const data = await hydratePosts(items, userId);
  return data.map((p, index) => ({ ...p, ...moderationFields(items[index]) }));
}
async function commentsDto(items) {
  const [authors, posts] = await Promise.all([
    lookupUsers(items.map((c) => c.authorId)),
    Post.find({ _id: { $in: items.map((c) => c.postId) } }).select('content deleted hidden visibility').lean(),
  ]);
  const postMap = new Map(posts.map((p) => [String(p._id), p]));
  return items.map((c) => ({
    commentId: String(c._id), postId: String(c.postId), authorId: c.authorId,
    authorName: authors.get(c.authorId)?.name || 'Trekker', authorAvatar: authors.get(c.authorId)?.avatarUrl || null,
    content: c.content, parentCommentId: c.parentCommentId ? String(c.parentCommentId) : null,
    rootCommentId: c.rootCommentId ? String(c.rootCommentId) : null,
    likeCount: c.likeCount, createdAt: c.createdAt, updatedAt: c.updatedAt, ...moderationFields(c),
    postContent: postMap.get(String(c.postId))?.content?.slice(0, 150) || '',
    postStatus: postMap.has(String(c.postId)) ? statusOf(postMap.get(String(c.postId))) : 'DELETED',
  }));
}

function createAdminService(events) {
  async function moderate(userId, entityType, entityId, action, reason) {
    const model = entityType === 'POST' ? Post : Comment;
    const existing = await model.findById(entityId).lean();
    if (!existing) throw notFound();
    const postId = entityType === 'POST' ? existing._id : existing.postId;
    let result, affectedPost;
    await mongoose.connection.transaction(async (session) => {
      // This same post write fence is used by all app mutations.
      const post = await Post.findOneAndUpdate({ _id: postId }, { $inc: { revision: 1 } }, { new: true, session });
      if (!post) throw notFound();
      const target = entityType === 'POST' ? post : await Comment.findById(entityId).session(session);
      if (!target) throw notFound();
      const before = statusOf(target);
      const after = action === 'HIDE' ? 'HIDDEN' : action === 'PUBLISH' ? 'ACTIVE' : 'DELETED';
      if (before === 'DELETED' && action !== 'DELETE') throw new AppError(409, 'CONTENT_DELETED', 'Nội dung đã xóa không thể khôi phục');
      if (entityType === 'COMMENT' && post.deleted && action !== 'DELETE') throw new AppError(409, 'POST_DELETED', 'Bài viết đã xóa');
      if (before === after) { result = target.toObject(); affectedPost = post; return; }
      target.hidden = action === 'HIDE';
      target.moderationReason = reason; target.moderatedBy = userId; target.moderatedAt = new Date();
      if (action === 'DELETE') {
        target.deleted = true; target.content = '';
        if (entityType === 'POST') {
          target.images = []; target.reactionCount = 0; target.commentCount = 0;
          await Reaction.deleteMany({ postId }, { session });
          await CommentReaction.deleteMany({ postId }, { session });
          await Comment.updateMany({ postId }, { $set: { deleted: true, content: '', likeCount: 0,
            moderationReason: reason, moderatedBy: userId, moderatedAt: target.moderatedAt } }, { session });
        } else {
          target.likeCount = 0;
          await CommentReaction.deleteMany({ commentId: entityId }, { session });
        }
      }
      if (entityType === 'COMMENT') {
        const delta = Number(after === 'ACTIVE') - Number(before === 'ACTIVE');
        post.commentCount = Math.max(0, post.commentCount + delta);
        await post.save({ session });
      }
      await target.save({ session });
      await ModerationLog.create([{ adminId: userId, entityType, entityId, postId,
        action, reason, beforeStatus: before, afterStatus: after }], { session });
      result = target.toObject(); affectedPost = post;
    });
    events.publish({ type: entityType === 'POST' ? (action === 'DELETE' ? 'post.deleted' : 'post.updated') : 'comment.updated',
      postId: String(postId), authorId: affectedPost.authorId, public: affectedPost.visibility === 'PUBLIC' });
    return entityType === 'POST' ? (await postsDto([result], userId))[0] : (await commentsDto([result]))[0];
  }
  return {
    async listPosts(userId, query) {
      const result = await repo.paginate(Post, filterFor(query), query, { createdAt: -1, _id: -1 });
      return { ...result, items: await postsDto(result.items, userId) };
    },
    async getPost(userId, postId) {
      const post = await Post.findById(postId).lean();
      if (!post) throw notFound();
      const recentActions = await ModerationLog.find({ postId }).sort({ createdAt: -1, _id: -1 }).limit(20)
        .select('-__v').lean();
      return { post: (await postsDto([post], userId))[0], recentActions: recentActions.map((log) => ({
        logId: String(log._id), adminId: log.adminId, entityType: log.entityType, entityId: String(log.entityId),
        action: log.action, reason: log.reason, beforeStatus: log.beforeStatus, afterStatus: log.afterStatus, createdAt: log.createdAt,
      })) };
    },
    async listComments(query) {
      const result = await repo.paginate(Comment, filterFor(query, true), query, { createdAt: -1, _id: -1 });
      return { ...result, items: await commentsDto(result.items) };
    },
    moderatePost: (userId, postId, action, reason) => moderate(userId, 'POST', postId, action, reason),
    moderateComment: (userId, commentId, action, reason) => moderate(userId, 'COMMENT', commentId, action, reason),
  };
}
module.exports = { createAdminService };
