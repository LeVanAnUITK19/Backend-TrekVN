'use strict';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const models = require('../src/models');
const { createEventBus } = require('../src/realtime/eventBus');
const { createCommunityService } = require('../src/services/community.service');

let db, app, bus, service, authMock;
const admin = new mongoose.Types.ObjectId().toString(), author = new mongoose.Types.ObjectId().toString(), other = new mongoose.Types.ObjectId().toString();
const base = '/api/v1/admin/community';
const auth = (req, id = admin, role = 'ADMIN') => req.auth(jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' }), { type: 'bearer' });
async function makePost(fields = {}) { return models.Post.create({ authorId: author, content: 'Leo núi Fansipan', ...fields }); }
const pagination = { page: 1, limit: 20 };
beforeAll(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.MONGODB_URI = db.getUri('community_admin_test');
  await require('../src/config/database').connectDB();
  bus = createEventBus(); app = createApp({ events: bus }); service = createCommunityService(bus);
});
beforeEach(async () => {
  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  authMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
    const claims = jwt.verify(options.headers.authorization.slice(7), process.env.JWT_SECRET);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { id: claims.id, role: claims.role } }) };
  });
});
afterEach(() => authMock.mockRestore());
afterAll(async () => { await bus.close(); await mongoose.disconnect(); await db?.stop(); });

test('admin endpoint requires auth and current ADMIN role, including direct service access', async () => {
  expect((await request(app).get(`${base}/posts`)).status).toBe(401);
  expect((await auth(request(app).get(`${base}/posts`), author, 'USER')).status).toBe(403);
  authMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { id: admin, role: 'USER' } }) });
  expect((await auth(request(app).get(`${base}/posts`))).status).toBe(403);
  authMock.mockRejectedValue(new Error('Auth offline'));
  expect((await auth(request(app).get(`${base}/posts`))).status).toBe(503);
});

test('lists real records with privacy/type/status/literal search and pagination, including legacy records', async () => {
  await makePost(); await makePost({ visibility: 'PRIVATE', type: 'BADGE_SHARE', hidden: true });
  const literal = await makePost({ content: 'literal .* search' });
  await models.Post.collection.updateOne({ _id: literal._id }, { $unset: { hidden: '' } });
  const response = await auth(request(app).get(`${base}/posts?status=ACTIVE&limit=1`));
  expect(response.status).toBe(200); expect(response.body.data).toMatchObject({ total: 2, totalPages: 2 });
  expect((await auth(request(app).get(`${base}/posts?status=HIDDEN&visibility=PRIVATE&type=BADGE_SHARE`))).body.data.total).toBe(1);
  expect((await auth(request(app).get(`${base}/posts?search=${encodeURIComponent('.*')}`))).body.data.total).toBe(1);
  expect((await auth(request(app).get(`${base}/posts?search=${literal._id}`))).body.data.items[0].postId).toBe(String(literal._id));
  expect((await auth(request(app).get(`${base}/posts?limit=-1`))).status).toBe(400);
  expect((await auth(request(app).get(`${base}/posts?status=UNKNOWN`))).status).toBe(400);
  expect((await auth(request(app).get(`${base}/posts?authorId[$ne]=x`))).status).toBe(400);
});

test('hidden post vanishes from app, blocks child writes and restores original privacy', async () => {
  const post = await makePost({ visibility: 'PRIVATE' });
  const hide = await auth(request(app).patch(`${base}/posts/${post._id}/hide`)).send({ reason: 'Nội dung cần kiểm tra' });
  expect(hide.status).toBe(200); expect(hide.body.data.status).toBe('HIDDEN');
  expect((await service.listPosts(author, pagination)).total).toBe(0);
  await expect(service.setPostLike(author, post._id, true)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.createComment(author, post._id, { content: 'hi' })).rejects.toMatchObject({ statusCode: 404 });
  const restore = await auth(request(app).patch(`${base}/posts/${post._id}/publish`)).send({ reason: 'Đã kiểm tra hợp lệ' });
  expect(restore.body.data).toMatchObject({ status: 'ACTIVE', visibility: 'PRIVATE' });
  expect((await service.listPosts(author, pagination)).total).toBe(1);
  expect((await service.listPosts(other, pagination)).total).toBe(0);
  const detail = await auth(request(app).get(`${base}/posts/${post._id}`));
  expect(detail.body.data.recentActions.map((log) => log.action)).toEqual(['PUBLISH', 'HIDE']);
});

test('comment hide/publish is idempotent, retains replies and keeps counters correct', async () => {
  const post = await makePost();
  const root = await service.createComment(author, post._id, { content: 'root' });
  await service.createComment(other, post._id, { content: 'reply', parentCommentId: root.commentId });
  await service.setCommentLike(other, root.commentId, true);
  const hide = () => auth(request(app).patch(`${base}/comments/${root.commentId}/hide`)).send({ reason: 'Ẩn bình luận' });
  const results = await Promise.all([hide(), hide(), hide()]);
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect((await models.Post.findById(post._id)).commentCount).toBe(1);
  const comments = await service.listComments(author, post._id, pagination);
  expect(comments.items[0]).toMatchObject({ hidden: true, content: '', authorId: null, likeCount: 0, isLiked: false });
  expect(comments.items[1].content).toBe('reply');
  await expect(service.setCommentLike(author, root.commentId, true)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.updateComment(author, root.commentId, { content: 'overwrite' })).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.createComment(author, post._id, { content: 'reply', parentCommentId: root.commentId })).rejects.toMatchObject({ statusCode: 404 });
  expect((await auth(request(app).get(`${base}/comments?postId=${post._id}&status=HIDDEN`))).body.data.items[0].content).toBe('root');
  await auth(request(app).patch(`${base}/comments/${root.commentId}/publish`)).send({ reason: 'Khôi phục hợp lệ' });
  expect((await models.Post.findById(post._id)).commentCount).toBe(2);
  expect((await service.listComments(other, post._id, pagination)).items[0]).toMatchObject({ content: 'root', likeCount: 1, isLiked: true });
  expect(await models.ModerationLog.countDocuments({ entityId: root.commentId })).toBe(2);
});

test('deleting an already hidden comment never decrements its parent counter twice', async () => {
  const post = await makePost();
  const c = await service.createComment(author, post._id, { content: 'one' });
  await service.createComment(author, post._id, { content: 'two' });
  await auth(request(app).patch(`${base}/comments/${c.commentId}/hide`)).send({ reason: 'Ẩn nội dung' });
  await service.deleteComment(author, c.commentId);
  expect((await models.Post.findById(post._id)).commentCount).toBe(1);
});

test('admin delete redacts descendants, removes reactions and cannot be undone', async () => {
  const post = await makePost();
  const c = await service.createComment(author, post._id, { content: 'old content' });
  await service.setPostLike(other, post._id, true); await service.setCommentLike(other, c.commentId, true);
  expect((await auth(request(app).delete(`${base}/posts/${post._id}`)).send({ reason: 'Vi phạm quy định cộng đồng' })).status).toBe(200);
  expect((await models.Post.findById(post._id))).toMatchObject({ deleted: true, content: '', images: [], reactionCount: 0, commentCount: 0 });
  expect((await models.Comment.findById(c.commentId)).content).toBe('');
  expect(await models.Reaction.countDocuments({})).toBe(0); expect(await models.CommentReaction.countDocuments({})).toBe(0);
  expect((await auth(request(app).patch(`${base}/posts/${post._id}/publish`)).send({ reason: 'Không khôi phục được' })).status).toBe(409);
  const before = await models.ModerationLog.countDocuments({});
  await auth(request(app).delete(`${base}/posts/${post._id}`)).send({ reason: 'Lặp yêu cầu xóa' });
  expect(await models.ModerationLog.countDocuments({})).toBe(before);
});

test('reason, IDs and unknown fields are validated; failed mutations emit no log/event', async () => {
  const post = await makePost(); const events = [];
  const off = bus.on((event) => events.push(event));
  for (const body of [{}, { reason: ' ' }, { reason: 'Okay', authorId: other }]) {
    expect((await auth(request(app).patch(`${base}/posts/${post._id}/hide`)).send(body)).status).toBe(400);
  }
  expect((await auth(request(app).delete(`${base}/posts/invalid`)).send({ reason: 'invalid id' })).status).toBe(400);
  expect(await models.ModerationLog.countDocuments({})).toBe(0); expect(events).toHaveLength(0); off();
});

test('moderation history and data roll back atomically when audit persistence fails', async () => {
  const post = await makePost();
  const audit = jest.spyOn(models.ModerationLog, 'create').mockRejectedValueOnce(new Error('Audit failure'));
  try {
    expect((await auth(request(app).patch(`${base}/posts/${post._id}/hide`)).send({ reason: 'Failed hide' })).status).toBe(500);
    expect((await models.Post.findById(post._id)).hidden).toBe(false);
  } finally { audit.mockRestore(); }
});

test('public moderation invalidates client state after commit with identifiers only', async () => {
  const post = await makePost(); const messages = []; const off = bus.on((event) => messages.push(event));
  try {
    await auth(request(app).patch(`${base}/posts/${post._id}/hide`)).send({ reason: 'Review content' });
    expect(messages).toHaveLength(1); expect(messages[0]).toMatchObject({ type: 'post.updated', postId: String(post._id), public: true });
    expect(messages[0].content).toBeUndefined(); expect(messages[0].reason).toBeUndefined();
  } finally { off(); }
});
