'use strict';
const mongoose = require('mongoose');
const { Post, Comment, Reaction, CommentReaction } = require('../models');
const repo = require('../repositories/community.repository');
const context = require('../providers/context.provider');
const { AppError, notFound, forbidden } = require('../utils/errors');

// Mongoose 7 / MongoDB driver 5 returns the commit result, not the callback's
// value. Capture the final successful retry explicitly for response/events.
async function inTransaction(work) {
  let result;
  await mongoose.connection.transaction(async (session) => { result = await work(session); });
  return result;
}

function plain(doc) { return doc.toObject ? doc.toObject() : doc; }
function postDto(doc, liked, authors) {
  const p = plain(doc);
  const author = authors.get(p.authorId);
  return {
    postId: String(p._id), authorId: p.authorId,
    authorName: author?.name || 'Trekker', authorAvatar: author?.avatarUrl || null,
    content: p.content, images: p.images, type: p.type,
    journeyId: p.journeyId || null, trekkingPlaceId: p.trekkingPlaceId || null,
    reactionCount: p.reactionCount, commentCount: p.commentCount,
    isLiked: liked.has(String(p._id)), visibility: p.visibility,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}
async function hydratePosts(posts, userId) {
  const [authors, reactions] = await Promise.all([
    context.lookupUsers(posts.map((p) => p.authorId)),
    Reaction.find({ postId: { $in: posts.map((p) => p._id) }, userId }).lean(),
  ]);
  const liked = new Set(reactions.map((r) => String(r.postId)));
  return posts.map((p) => postDto(p, liked, authors));
}
async function hydrateComments(comments, userId) {
  const [authors, reactions] = await Promise.all([
    context.lookupUsers(comments.filter((c) => !c.deleted).map((c) => c.authorId)),
    CommentReaction.find({ commentId: { $in: comments.map((c) => c._id) }, userId }).lean(),
  ]);
  const liked = new Set(reactions.map((r) => String(r.commentId)));
  return comments.map((doc) => {
    const c = plain(doc);
    const author = authors.get(c.authorId);
    return {
      commentId: String(c._id), postId: String(c.postId),
      authorId: c.deleted ? null : c.authorId,
      authorName: c.deleted ? 'Trekker' : (author?.name || 'Trekker'),
      authorAvatar: c.deleted ? null : (author?.avatarUrl || null),
      content: c.deleted ? '' : c.content, deleted: c.deleted,
      parentCommentId: c.parentCommentId ? String(c.parentCommentId) : null,
      rootCommentId: c.rootCommentId ? String(c.rootCommentId) : null,
      likeCount: c.deleted ? 0 : c.likeCount, isLiked: !c.deleted && liked.has(String(c._id)),
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  });
}
function checkContent(post) {
  if (!post.content?.trim() && !post.images?.length) {
    throw new AppError(400, 'EMPTY_POST', 'Bài viết cần nội dung hoặc ít nhất một ảnh');
  }
  if (post.type === 'JOURNEY_SHARE' && !post.journeyId) {
    throw new AppError(400, 'JOURNEY_REQUIRED', 'Bài chia sẻ hành trình cần journeyId');
  }
}
function owner(doc, userId) { if (doc.authorId !== userId) throw forbidden(); }

function createCommunityService(events) {
  // Invalidation events contain identifiers only. No private content is broadcast.
  function emit(type, post, wasPublic = false) {
    events.publish({ type, postId: String(post._id), authorId: post.authorId,
      public: post.visibility === 'PUBLIC' || wasPublic });
  }
  return {
    async listPosts(userId, query) {
      const filter = repo.visibleTo(userId);
      if (query.userId) filter.authorId = query.userId;
      if (query.type) filter.type = query.type;
      if (query.trekkingPlaceId) filter.trekkingPlaceId = query.trekkingPlaceId;
      const result = await repo.paginate(Post, filter, query, { createdAt: -1, _id: -1 });
      result.items = await hydratePosts(result.items, userId);
      return result;
    },
    async getPost(userId, postId) {
      return (await hydratePosts([await repo.readablePost(postId, userId)], userId))[0];
    },
    async createPost(userId, body, authorization) {
      checkContent(body);
      await context.validateLinks(body, authorization);
      const post = await Post.create({ ...body, authorId: userId });
      emit('post.created', post);
      return (await hydratePosts([post], userId))[0];
    },
    async updatePost(userId, postId, body, authorization) {
      const existing = await repo.readablePost(postId, userId);
      owner(existing, userId);
      const linked = { ...existing.toObject(), ...body };
      checkContent(linked);
      const changesLinks = ['journeyId', 'trekkingPlaceId', 'type'].some((field) => field in body);
      if (changesLinks) {
        await context.validateLinks(linked, authorization);
      }
      // Preserve only the fields validated by the HTTP boundary.
      const updates = { ...body };
      if ('journeyId' in body || 'trekkingPlaceId' in body) updates.trekkingPlaceId = linked.trekkingPlaceId;
      let wasPublic;
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(postId, userId, session);
        owner(current, userId);
        // Linked resources were verified over HTTP before the transaction.
        // Do not merge that result into a different concurrently edited link.
        if (changesLinks && ['journeyId', 'trekkingPlaceId', 'type'].some((field) =>
          (current[field] ?? null) !== (existing[field] ?? null))) {
          throw new AppError(409, 'POST_CHANGED', 'Liên kết bài viết đã thay đổi. Vui lòng tải lại bài viết.');
        }
        checkContent({ ...current.toObject(), ...updates });
        wasPublic = current.visibility === 'PUBLIC';
        Object.assign(current, updates);
        await current.save({ session });
        return current;
      });
      emit('post.updated', post, wasPublic);
      return (await hydratePosts([post], userId))[0];
    },
    async deletePost(userId, postId) {
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(postId, userId, session);
        owner(current, userId);
        current.deleted = true;
        current.content = '';
        current.images = [];
        current.reactionCount = 0;
        current.commentCount = 0;
        await current.save({ session });
        await Reaction.deleteMany({ postId }, { session });
        await CommentReaction.deleteMany({ postId }, { session });
        await Comment.updateMany({ postId }, { $set: { deleted: true, content: '', likeCount: 0 } }, { session });
        return current;
      });
      emit('post.deleted', post);
    },
    async setPostLike(userId, postId, active) {
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(postId, userId, session);
        const existing = await Reaction.findOne({ postId, userId }).session(session);
        if (active && !existing) {
          await Reaction.create([{ postId, userId }], { session });
          current.reactionCount++;
        } else if (!active && existing) {
          await Reaction.deleteOne({ _id: existing._id }, { session });
          current.reactionCount = Math.max(0, current.reactionCount - 1);
        }
        await current.save({ session });
        return current;
      });
      emit('post.reaction.updated', post);
      return { postId, isLiked: active, reactionCount: post.reactionCount };
    },
    async listComments(userId, postId, query) {
      await repo.readablePost(postId, userId);
      // Keep redacted tombstones so replies remain attached after parent deletion.
      const result = await repo.paginate(Comment, { postId }, query, { createdAt: 1, _id: 1 });
      result.items = await hydrateComments(result.items, userId);
      return result;
    },
    async createComment(userId, postId, body) {
      let comment;
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(postId, userId, session);
        let rootCommentId = null;
        if (body.parentCommentId) {
          const parent = await Comment.findOne({ _id: body.parentCommentId, postId, deleted: false }).session(session);
          if (!parent) throw notFound();
          rootCommentId = parent.rootCommentId || parent._id;
        }
        [comment] = await Comment.create([{ ...body, rootCommentId, postId, authorId: userId }], { session });
        current.commentCount++;
        await current.save({ session });
        return current;
      });
      emit('comment.created', post);
      return (await hydrateComments([comment], userId))[0];
    },
    async updateComment(userId, commentId, body) {
      const existing = await Comment.findById(commentId);
      if (!existing) throw notFound();
      let updated;
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(existing.postId, userId, session);
        const comment = await Comment.findOne({ _id: commentId, deleted: false }).session(session);
        if (!comment) throw notFound();
        owner(comment, userId);
        comment.content = body.content;
        updated = await comment.save({ session });
        return current;
      });
      emit('comment.updated', post);
      return (await hydrateComments([updated], userId))[0];
    },
    async deleteComment(userId, commentId) {
      const existing = await Comment.findById(commentId);
      if (!existing) throw notFound();
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(existing.postId, userId, session);
        const comment = await Comment.findById(commentId).session(session);
        if (comment.authorId !== userId && current.authorId !== userId) throw forbidden();
        if (!comment.deleted) {
          comment.deleted = true;
          comment.content = '';
          comment.likeCount = 0;
          await comment.save({ session });
          await CommentReaction.deleteMany({ commentId }, { session });
          current.commentCount = Math.max(0, current.commentCount - 1);
          await current.save({ session });
        }
        return current;
      });
      emit('comment.deleted', post);
    },
    async setCommentLike(userId, commentId, active) {
      const existing = await Comment.findById(commentId);
      if (!existing) throw notFound();
      let count;
      const post = await inTransaction(async (session) => {
        const current = await repo.lockPost(existing.postId, userId, session);
        const comment = await Comment.findOne({ _id: commentId, deleted: false }).session(session);
        if (!comment) throw notFound();
        const reaction = await CommentReaction.findOne({ commentId, userId }).session(session);
        if (active && !reaction) {
          await CommentReaction.create([{ commentId, postId: current._id, userId }], { session });
          comment.likeCount++;
        } else if (!active && reaction) {
          await CommentReaction.deleteOne({ _id: reaction._id }, { session });
          comment.likeCount = Math.max(0, comment.likeCount - 1);
        }
        await comment.save({ session });
        count = comment.likeCount;
        return current;
      });
      emit('comment.reaction.updated', post);
      return { commentId, isLiked: active, likeCount: count };
    },
  };
}
module.exports = { createCommunityService };
