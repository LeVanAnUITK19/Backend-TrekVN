'use strict';
const { Post } = require('../models');
const { notFound } = require('../utils/errors');

function visibleTo(userId) {
  return { deleted: false, hidden: { $ne: true }, $or: [{ visibility: 'PUBLIC' }, { authorId: userId }] };
}
async function readablePost(postId, userId, session) {
  const post = await Post.findOne({ _id: postId, ...visibleTo(userId) }).session(session || null);
  if (!post) throw notFound();
  return post;
}
async function lockPost(postId, userId, session) {
  const post = await Post.findOneAndUpdate(
    { _id: postId, ...visibleTo(userId) }, { $inc: { revision: 1 } }, { new: true, session },
  );
  if (!post) throw notFound();
  return post;
}
async function paginate(model, filter, query, sort) {
  const { page, limit } = query;
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
module.exports = { visibleTo, readablePost, lockPost, paginate };
