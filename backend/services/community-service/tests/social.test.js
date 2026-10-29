'use strict';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const models = require('../src/models');
const { createSocialService } = require('../src/services/social.service');
const { createEventBus } = require('../src/realtime/eventBus');
let db, bus, app, api, mock;
const a = new mongoose.Types.ObjectId().toString(), b = new mongoose.Types.ObjectId().toString(), c = new mongoose.Types.ObjectId().toString();
const users = [a, b, c].map((id, i) => ({ id, name: ['Lan', 'Minh', 'Hà'][i], avatarUrl: null }));
const auth = (r, id = a, role = 'USER') => r.auth(jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' }), { type: 'bearer' });
const page = { page: 1, limit: 20 };
beforeAll(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.MONGODB_URI = db.getUri('community_social_test'); process.env.TREKVIET_INTERNAL_TOKEN = 'test-social';
  await require('../src/config/database').connectDB(); bus = createEventBus();
  api = createSocialService(bus); app = require('../src/app')({ events: bus });
});
beforeEach(async () => {
  await Promise.all(Object.values(models).map(m => m.deleteMany({})));
  mock = jest.spyOn(global, 'fetch').mockImplementation(async (url, options) => {
    let data;
    if (url.endsWith('/auth/verify')) { const p = jwt.verify(options.headers.authorization.slice(7), process.env.JWT_SECRET); data = { id: p.id, role: p.role }; }
    else { const input = JSON.parse(options.body); data = input.email ? (input.email === 'lan@example.com' ? [users[0]] : []) : users.filter(u => input.userIds.includes(u.id)); }
    return { status: 200, ok: true, json: async () => ({ success: true, data }) };
  });
});
afterEach(() => mock.mockRestore());
afterAll(async () => { await bus.close(); await mongoose.disconnect(); await db.stop(); });

test('exact discovery, public profile privacy, QR rotation and profile validation', async () => {
  const me = await api.profile(a, a);
  expect(me.qr).toMatch(/^trekviet:\/\/community\/user\/[a-f0-9]{48}$/);
  expect((await api.profile(b, a)).qr).toBeUndefined();
  expect((await api.discover(b, { email: 'lan@example.com' })).userId).toBe(a);
  expect((await api.discover(b, { qr: me.qr })).userId).toBe(a);
  await api.rotateQr(a); await expect(api.discover(b, { qr: me.qr })).rejects.toMatchObject({ statusCode: 404 });
  expect((await api.updateProfile(a, { bio: 'Yêu thiên nhiên' })).bio).toBe('Yêu thiên nhiên');
  await models.Post.create([{ authorId: a, content: 'public' }, { authorId: a, content: 'private', visibility: 'PRIVATE' }, { authorId: a, content: 'hidden', hidden: true }]);
  expect((await api.profile(b, a)).postCount).toBe(1); expect((await api.profile(a, a)).postCount).toBe(2);
  expect((await auth(request(app).get('/api/v1/community/people/discover?email=lan'))).status).toBe(400);
  expect((await auth(request(app).patch('/api/v1/community/people/me')).send({ bio: 'ok', userId: b })).status).toBe(400);
});
test('direct chat is unique under reversed concurrent creation and does not admit outsiders', async () => {
  const chats = await Promise.all([api.direct(a, b), api.direct(b, a), api.direct(a, b)]);
  expect(new Set(chats.map(x => x.conversationId)).size).toBe(1);
  const id = chats[0].conversationId;
  expect(await models.ConversationMember.countDocuments({})).toBe(2);
  await expect(api.conversation(c, id)).rejects.toMatchObject({ statusCode: 404 });
  await expect(api.messages(c, id, { limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
  await expect(api.send(c, id, { content: 'forged', clientMessageId: 'forged_001' })).rejects.toMatchObject({ statusCode: 404 });
  await expect(api.membership(a, id, c, true)).rejects.toMatchObject({ statusCode: 403 });
  await expect(api.direct(a, a)).rejects.toMatchObject({ statusCode: 409 });
});
test('message retry is idempotent; sequence, unread, read cursor and pagination remain correct', async () => {
  const id = (await api.direct(a, b)).conversationId;
  const send = () => api.send(a, id, { content: 'Hello', clientMessageId: 'retry_key_01' });
  const result = await Promise.all([send(), send(), send()]);
  expect(new Set(result.map(x => x.messageId)).size).toBe(1);
  expect(await models.Message.countDocuments({})).toBe(1);
  await api.send(a, id, { content: 'Second', clientMessageId: 'retry_key_02' });
  expect((await api.conversation(b, id)).unreadCount).toBe(2);
  const newest = await api.messages(b, id, { limit: 1 });
  expect(newest.items[0].sequence).toBe(2);
  expect((await api.messages(b, id, { limit: 1, before: newest.nextBefore })).items[0].sequence).toBe(1);
  await api.read(b, id, 1); expect((await api.conversation(b, id)).unreadCount).toBe(1);
  await api.read(b, id, 0); expect((await api.conversation(b, id)).readSequence).toBe(1);
  await api.read(b, id, 999); expect((await api.conversation(b, id)).readSequence).toBe(2);
  await expect(api.send(a, id, { content: 'Changed', clientMessageId: 'retry_key_01' })).rejects.toMatchObject({ statusCode: 409 });
});
test('group lifecycle: owner permissions, joins exclude old history, removal, transfer and leave', async () => {
  const id = (await api.group(a, { name: 'Đi Trek', memberIds: [b] })).conversationId;
  await api.send(a, id, { content: 'Before join', clientMessageId: 'group_msg_01' });
  await expect(api.editGroup(b, id, { name: 'Hijacked' })).rejects.toMatchObject({ statusCode: 403 });
  await api.membership(a, id, c, true);
  expect((await api.messages(c, id, { limit: 20 })).items).toEqual([]);
  await api.send(b, id, { content: 'After join', clientMessageId: 'group_msg_02' });
  expect((await api.messages(c, id, { limit: 20 })).items).toHaveLength(1);
  await expect(api.membership(b, id, c, false)).rejects.toMatchObject({ statusCode: 403 });
  await expect(api.membership(a, id, a, false)).rejects.toMatchObject({ statusCode: 409 });
  await api.editGroup(a, id, { ownerId: b, name: 'Nhóm mới' });
  await api.membership(a, id, a, false);
  await expect(api.messages(a, id, { limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
  await api.membership(b, id, c, false);
  expect((await api.conversations(c, page)).total).toBe(0);
  await expect(api.send(c, id, { content: 'Removed', clientMessageId: 'group_msg_03' })).rejects.toMatchObject({ statusCode: 404 });
});
test('recall, report and admin resolution redact content and audit atomically', async () => {
  const id = (await api.direct(a, b)).conversationId;
  const m = await api.send(a, id, { content: 'Reported content', clientMessageId: 'report_msg_01' });
  await expect(api.removeMessage(b, id, m.messageId)).rejects.toMatchObject({ statusCode: 403 });
  await expect(api.report(c, id, m.messageId, 'Not a member')).rejects.toMatchObject({ statusCode: 404 });
  const report = await api.report(b, id, m.messageId, 'Vi phạm quy định');
  expect((await api.report(b, id, m.messageId, 'Repeated')).reportId).toBe(report.reportId);
  expect((await api.reports(page)).items[0].contentSnapshot).toBe('Reported content');
  await api.resolveReport(c, report.reportId, { action: 'REMOVE', reason: 'Đã xác minh' });
  expect((await api.messages(b, id, { limit: 20 })).items[0]).toMatchObject({ deleted: true, content: '' });
  expect(await models.SocialModerationLog.countDocuments({})).toBe(1);
  await expect(api.resolveReport(c, report.reportId, { action: 'DISMISS', reason: 'Duplicate' })).rejects.toMatchObject({ statusCode: 409 });
  const m2 = await api.send(a, id, { content: 'Recall', clientMessageId: 'report_msg_02' });
  await api.removeMessage(a, id, m2.messageId);
  expect((await api.conversation(b, id)).unreadCount).toBe(0);
});
test('group moderation blocks sending, does not expose DMs and rolls back on log failure', async () => {
  const id = (await api.group(a, { name: 'Trekking', memberIds: [b] })).conversationId;
  await api.direct(a, c);
  expect((await api.adminGroups(page)).total).toBe(1);
  const log = jest.spyOn(models.SocialModerationLog, 'create').mockRejectedValueOnce(new Error('Write failed'));
  await expect(api.moderateGroup(c, id, true, 'Review')).rejects.toThrow('Write failed'); log.mockRestore();
  expect((await models.Conversation.findById(id)).disabled).toBe(false);
  await api.moderateGroup(c, id, true, 'Review');
  await expect(api.send(a, id, { content: 'Paused', clientMessageId: 'paused_msg_1' })).rejects.toMatchObject({ statusCode: 409 });
  await api.moderateGroup(c, id, false, 'Verified');
  expect((await api.send(a, id, { content: 'Restored', clientMessageId: 'paused_msg_1' })).sequence).toBe(1);
});
test('REST enforces current session, admin role, input validation, and recipient-only invalidations', async () => {
  expect((await request(app).get('/api/v1/community/conversations')).status).toBe(401);
  expect((await auth(request(app).get('/api/v1/admin/community/groups'))).status).toBe(403);
  expect((await auth(request(app).get('/api/v1/admin/community/groups'), a, 'ADMIN')).status).toBe(200);
  expect((await auth(request(app).post('/api/v1/community/conversations/groups')).send({ name: 'X', memberIds: [b, b] })).status).toBe(400);
  const events = []; const off = bus.on(e => events.push(e));
  const id = (await api.direct(a, b)).conversationId;
  await api.send(a, id, { content: 'Private text', clientMessageId: 'private_msg_1' }); off();
  const event = events.find(e => e.type === 'message.created');
  expect(event.recipientIds.sort()).toEqual([a, b].sort());
  expect(event.content).toBeUndefined(); expect(event.public).toBeUndefined();
  mock.mockResolvedValue({ ok: false, status: 401 });
  expect((await auth(request(app).get('/api/v1/community/conversations'))).status).toBe(401);
});
