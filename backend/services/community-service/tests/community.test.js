'use strict';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const models = require('../src/models');
const { createEventBus } = require('../src/realtime/eventBus');
const context = require('../src/providers/context.provider');

let db, app, events;
const alice = new mongoose.Types.ObjectId().toString();
const bob = new mongoose.Types.ObjectId().toString();
const token = (id) => jwt.sign({ id, role: 'USER' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (req, id = alice) => req.set('Authorization', `Bearer ${token(id)}`);
async function post(body = {}) {
  const response = await auth(request(app).post('/api/v1/posts')).send({ content: 'Chuyến đi Fansipan', ...body });
  expect(response.status).toBe(201);
  return response.body.data;
}
async function comment(postId, content = 'Tuyệt vời', parentCommentId, id = alice) {
  const response = await auth(request(app).post(`/api/v1/posts/${postId}/comments`), id)
    .send({ content, ...(parentCommentId ? { parentCommentId } : {}) });
  expect(response.status).toBe(201);
  return response.body.data;
}
beforeAll(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.MONGODB_URI = db.getUri('community_test');
  await require('../src/config/database').connectDB();
  events = createEventBus();
  app = createApp({ events });
});
beforeEach(async () => {
  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
});
afterAll(async () => {
  await events?.close();
  await mongoose.disconnect();
  await db?.stop();
});

test('requires JWT, rejects invalid IDs, identity injection, excess images and bad pagination', async () => {
  expect((await request(app).get('/api/v1/posts')).status).toBe(401);
  expect((await auth(request(app).get('/api/v1/posts/not-an-id'))).status).toBe(400);
  expect((await auth(request(app).get('/api/v1/posts?limit=-1'))).status).toBe(400);
  expect((await auth(request(app).get('/api/v1/posts?userId[$ne]=alice'))).status).toBe(400);
  for (const body of [{ authorId: bob, content: 'fake' }, {}, { content: 'x', images: Array(6).fill('https://example.com/x.jpg') },
    { content: 'x', images: ['file:///private/image.jpg'] }, { content: 'x', type: 'GENERAL' }]) {
    expect((await auth(request(app).post('/api/v1/posts')).send(body)).status).toBe(400);
  }
});

test('feed pagination, type/author filtering and private posts follow the caller', async () => {
  await post();
  const hidden = await post({ visibility: 'PRIVATE' });
  await post({ type: 'BADGE_SHARE' });
  const own = await auth(request(app).get('/api/v1/posts?limit=2'));
  expect(own.body.data).toMatchObject({ total: 3, page: 1, totalPages: 2 });
  expect(own.body.data.items).toHaveLength(2);
  const other = await auth(request(app).get(`/api/v1/posts?userId=${alice}`), bob);
  expect(other.body.data.total).toBe(2);
  expect((await auth(request(app).get(`/api/v1/posts/${hidden.postId}`), bob)).status).toBe(404);
  expect((await auth(request(app).post(`/api/v1/posts/${hidden.postId}/like`), bob)).status).toBe(404);
  expect((await auth(request(app).get(`/api/v1/posts/${hidden.postId}/comments`), bob)).status).toBe(404);
  expect((await auth(request(app).get('/api/v1/posts?type=BADGE_SHARE'))).body.data.total).toBe(1);
});

test('only author can edit/delete a post; rejects empty merged state', async () => {
  const p = await post();
  expect((await auth(request(app).put(`/api/v1/posts/${p.postId}`), bob).send({ content: 'hijack' })).status).toBe(403);
  expect((await auth(request(app).delete(`/api/v1/posts/${p.postId}`), bob)).status).toBe(403);
  expect((await auth(request(app).put(`/api/v1/posts/${p.postId}`)).send({ content: '' })).status).toBe(400);
  const updated = await auth(request(app).patch(`/api/v1/posts/${p.postId}`)).send({ content: 'Đã chỉnh sửa', visibility: 'PRIVATE' });
  expect(updated.status).toBe(200);
  expect(updated.body.data.content).toBe('Đã chỉnh sửa');
  expect((await auth(request(app).get(`/api/v1/posts/${p.postId}`), bob)).status).toBe(404);
});

test('concurrent repeated likes/unlikes are idempotent and counters match persisted reactions', async () => {
  const p = await post();
  const url = `/api/v1/posts/${p.postId}/like`;
  const likes = await Promise.all(Array.from({ length: 8 }, () => auth(request(app).post(url), bob)));
  expect(likes.every((r) => r.status === 200)).toBe(true);
  expect(likes.every((r) => r.body.data.postId === p.postId && r.body.data.reactionCount === 1)).toBe(true);
  expect(await models.Reaction.countDocuments({ postId: p.postId })).toBe(1);
  expect((await models.Post.findById(p.postId)).reactionCount).toBe(1);
  expect((await auth(request(app).get(`/api/v1/posts/${p.postId}`), bob)).body.data.isLiked).toBe(true);
  expect((await auth(request(app).get(`/api/v1/posts/${p.postId}`))).body.data.isLiked).toBe(false);
  const unlikes = await Promise.all(Array.from({ length: 8 }, () => auth(request(app).delete(url), bob)));
  expect(unlikes.every((r) => r.status === 200)).toBe(true);
  expect((await models.Post.findById(p.postId)).reactionCount).toBe(0);
});

test('nested replies keep root ID; cross-post replies and replies to deleted comments fail', async () => {
  const p = await post();
  const other = await post();
  const root = await comment(p.postId);
  const reply = await comment(p.postId, 'reply', root.commentId, bob);
  const nested = await comment(p.postId, 'nested', reply.commentId);
  expect(nested.rootCommentId).toBe(root.commentId);
  const wrong = await auth(request(app).post(`/api/v1/posts/${other.postId}/comments`))
    .send({ content: 'wrong', parentCommentId: root.commentId });
  expect(wrong.status).toBe(404);
  expect((await auth(request(app).delete(`/api/v1/comments/${root.commentId}`))).status).toBe(200);
  const response = await auth(request(app).get(`/api/v1/posts/${p.postId}/comments`));
  expect(response.body.data.items).toHaveLength(3);
  expect(response.body.data.items[0]).toMatchObject({ deleted: true, content: '', authorId: null });
  expect((await models.Post.findById(p.postId)).commentCount).toBe(2);
  const deletedParent = await auth(request(app).post(`/api/v1/posts/${p.postId}/comments`))
    .send({ content: 'late', parentCommentId: root.commentId });
  expect(deletedParent.status).toBe(404);
});

test('comment ownership, author moderation, comment likes and repeated deletes', async () => {
  const p = await post();
  const c = await comment(p.postId, 'hi', undefined, bob);
  expect((await auth(request(app).put(`/api/v1/comments/${c.commentId}`)).send({ content: 'hijack' })).status).toBe(403);
  expect((await auth(request(app).put(`/api/v1/comments/${c.commentId}`), bob).send({ content: 'edited' })).status).toBe(200);
  const url = `/api/v1/comments/${c.commentId}/like`;
  await auth(request(app).post(url));
  await auth(request(app).post(url));
  expect((await models.Comment.findById(c.commentId)).likeCount).toBe(1);
  await auth(request(app).delete(url));
  await auth(request(app).delete(url));
  expect((await models.Comment.findById(c.commentId)).likeCount).toBe(0);
  await auth(request(app).delete(`/api/v1/comments/${c.commentId}`));
  await auth(request(app).delete(`/api/v1/comments/${c.commentId}`));
  expect((await models.Post.findById(p.postId)).commentCount).toBe(0);
  expect((await auth(request(app).post(url))).status).toBe(404);
});

test('post deletion redacts children and prevents subsequent interactions', async () => {
  const p = await post();
  const c = await comment(p.postId);
  await auth(request(app).post(`/api/v1/posts/${p.postId}/like`), bob);
  await auth(request(app).post(`/api/v1/comments/${c.commentId}/like`), bob);
  await auth(request(app).delete(`/api/v1/posts/${p.postId}`));
  expect((await models.Comment.findById(c.commentId)).content).toBe('');
  expect(await models.Reaction.countDocuments({})).toBe(0);
  expect(await models.CommentReaction.countDocuments({})).toBe(0);
  expect((await auth(request(app).get(`/api/v1/posts/${p.postId}`))).status).toBe(404);
  expect((await auth(request(app).put(`/api/v1/comments/${c.commentId}`)).send({ content: 'revive' })).status).toBe(404);
});

test('concurrent deletion and child writes never leave live children or stale counters', async () => {
  const p = await post();
  const results = await Promise.all([
    auth(request(app).post(`/api/v1/posts/${p.postId}/like`), bob),
    auth(request(app).post(`/api/v1/posts/${p.postId}/comments`), bob).send({ content: 'racing reply' }),
    auth(request(app).delete(`/api/v1/posts/${p.postId}`)),
  ]);
  expect([200, 404]).toContain(results[0].status);
  expect([201, 404]).toContain(results[1].status);
  expect(results[2].status).toBe(200);
  expect(await models.Reaction.countDocuments({ postId: p.postId })).toBe(0);
  expect(await models.Comment.countDocuments({ postId: p.postId, deleted: false })).toBe(0);
  expect(await models.Post.findById(p.postId)).toMatchObject({ deleted: true, commentCount: 0, reactionCount: 0 });
});

test('transaction rolls back both the comment and counter on a write failure', async () => {
  const p = await post();
  const save = jest.spyOn(models.Post.prototype, 'save').mockRejectedValueOnce(new Error('Simulated write failure'));
  const response = await auth(request(app).post(`/api/v1/posts/${p.postId}/comments`)).send({ content: 'rollback' });
  save.mockRestore();
  expect(response.status).toBe(500);
  expect(await models.Comment.countDocuments({ postId: p.postId })).toBe(0);
  expect((await models.Post.findById(p.postId)).commentCount).toBe(0);
});

test('author enrichment does not leak internal email and gracefully handles missing names', async () => {
  const lookup = jest.spyOn(context, 'lookupUsers').mockResolvedValue(new Map([[alice, { name: 'Lan', avatarUrl: 'https://example.com/a.jpg', email: 'private@example.com' }]]));
  const p = await post();
  lookup.mockRestore();
  expect(p.authorName).toBe('Lan');
  expect(JSON.stringify(p)).not.toContain('private@example.com');
});

test('linked journeys are verified with the caller JWT; unrelated shares do not call trekking', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: { trekkingPlaceId: '123456789012345678901234' } }) });
  const journeyId = new mongoose.Types.ObjectId().toString();
  const p = await post({ type: 'JOURNEY_SHARE', journeyId });
  expect(p.trekkingPlaceId).toBe('123456789012345678901234');
  expect(fetchMock.mock.calls[0][1].headers.authorization).toMatch(/^Bearer /);
  fetchMock.mockRestore();
});

test('health/readiness and metrics work without JWT', async () => {
  expect((await request(app).get('/health')).status).toBe(200);
  expect((await request(app).get('/ready')).status).toBe(200);
  const metrics = await request(app).get('/metrics');
  expect(metrics.text).toContain('service="community-service"');
  expect((await request(app).get('/api-docs.json')).body.paths['/api/v1/posts']).toBeDefined();
});

test('attachment edits can clear a journey and reset the post type', async () => {
  const journeyId = new mongoose.Types.ObjectId().toString();
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true,
    json: async () => ({ data: { trekkingPlaceId: '123456789012345678901234' } }) });
  try {
    const p = await post({ type: 'JOURNEY_SHARE', journeyId });
    const updated = await auth(request(app).patch(`/api/v1/posts/${p.postId}`))
      .send({ type: 'NORMAL', journeyId: null, trekkingPlaceId: null, visibility: 'PRIVATE' });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ type: 'NORMAL', journeyId: null, trekkingPlaceId: null, visibility: 'PRIVATE' });
    expect(updated.headers['cache-control']).toBe('private, no-store');
  } finally { fetchMock.mockRestore(); }
});

test('a stale link verification cannot overwrite a concurrently changed journey', async () => {
  const p = await post();
  const newJourney = new mongoose.Types.ObjectId().toString();
  const verifyLinks = jest.spyOn(context, 'validateLinks').mockImplementation(async () => {
    await models.Post.updateOne({ _id: p.postId }, { $set: { journeyId: newJourney, type: 'JOURNEY_SHARE' } });
  });
  try {
    const updated = await auth(request(app).patch(`/api/v1/posts/${p.postId}`)).send({ type: 'BADGE_SHARE' });
    expect(updated.status).toBe(409);
    expect(updated.body.error.code).toBe('POST_CHANGED');
    expect((await models.Post.findById(p.postId)).journeyId).toBe(newJourney);
  } finally { verifyLinks.mockRestore(); }
});

test('mutations emit committed identifiers; changing public to private emits a retraction invalidation', async () => {
  const messages = [];
  const unsubscribe = events.on((event) => messages.push(event));
  try {
    const p = await post();
    await auth(request(app).patch(`/api/v1/posts/${p.postId}`)).send({ visibility: 'PRIVATE' });
    await auth(request(app).post(`/api/v1/posts/${p.postId}/like`));
    expect(messages.map((e) => e.postId)).toEqual([p.postId, p.postId, p.postId]);
    expect(messages.map((e) => e.public)).toEqual([true, true, false]);
    expect(messages.every((e) => !('content' in e))).toBe(true);
  } finally { unsubscribe(); }
});

