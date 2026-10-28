'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const reference = { type: Schema.Types.ObjectId };
const postSchema = new Schema({
  authorId: { type: String, required: true },
  content: { type: String, default: '', maxlength: 10000 },
  images: { type: [String], default: [], validate: (v) => v.length <= 5 },
  type: { type: String, enum: ['NORMAL', 'JOURNEY_SHARE', 'BADGE_SHARE'], default: 'NORMAL' },
  journeyId: String,
  trekkingPlaceId: String,
  reactionCount: { type: Number, default: 0, min: 0 },
  commentCount: { type: Number, default: 0, min: 0 },
  visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PUBLIC' },
  deleted: { type: Boolean, default: false },
  // A write fence serializes child writes against post deletion/privacy changes.
  revision: { type: Number, default: 0 },
}, { timestamps: true, collection: 'posts' });
postSchema.index({ deleted: 1, visibility: 1, createdAt: -1, _id: -1 });
postSchema.index({ authorId: 1, deleted: 1, createdAt: -1, _id: -1 });
postSchema.index({ journeyId: 1 });
postSchema.index({ trekkingPlaceId: 1, createdAt: -1 });

const commentSchema = new Schema({
  postId: { ...reference, ref: 'Post', required: true },
  authorId: { type: String, required: true },
  parentCommentId: { ...reference, ref: 'Comment', default: null },
  rootCommentId: { ...reference, ref: 'Comment', default: null },
  content: { type: String, required() { return !this.deleted; }, maxlength: 2000 },
  deleted: { type: Boolean, default: false },
  likeCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true, collection: 'comments' });
commentSchema.index({ postId: 1, createdAt: 1, _id: 1 });
commentSchema.index({ postId: 1, rootCommentId: 1 });
commentSchema.index({ authorId: 1 });

const reactionSchema = new Schema({
  postId: { ...reference, ref: 'Post', required: true },
  userId: { type: String, required: true },
  type: { type: String, enum: ['LIKE'], default: 'LIKE' },
}, { timestamps: true, collection: 'reactions' });
reactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

const commentReactionSchema = new Schema({
  commentId: { ...reference, ref: 'Comment', required: true },
  postId: { ...reference, ref: 'Post', required: true },
  userId: { type: String, required: true },
}, { timestamps: true, collection: 'comment_reactions' });
commentReactionSchema.index({ commentId: 1, userId: 1 }, { unique: true });
commentReactionSchema.index({ postId: 1 });

module.exports = {
  Post: mongoose.model('Post', postSchema),
  Comment: mongoose.model('Comment', commentSchema),
  Reaction: mongoose.model('Reaction', reactionSchema),
  CommentReaction: mongoose.model('CommentReaction', commentReactionSchema),
};
