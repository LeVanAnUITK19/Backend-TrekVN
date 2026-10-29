'use strict';
const mongoose = require('mongoose');
const { randomBytes } = require('crypto');
const { CommunityProfile, Conversation, ConversationMember, Message, MessageReport, SocialModerationLog, Post } = require('../models');
const { communityUsers } = require('../providers/context.provider');
const { paginate, visibleTo } = require('../repositories/community.repository');
const { AppError, notFound } = require('../utils/errors');
const fail = (code, message) => { throw new AppError(409, code, message); };
const messageDto = m => ({ messageId: String(m._id), conversationId: String(m.conversationId), senderId: m.senderId,
  sequence: m.sequence, clientMessageId: m.clientMessageId, content: m.deleted ? '' : m.content, deleted: m.deleted, createdAt: m.createdAt });
async function membersExist(ids) {
  const users = await communityUsers({ userIds: ids });
  if (users.length !== ids.length) throw new AppError(400, 'USER_UNAVAILABLE', 'Có người dùng không tồn tại hoặc đã bị khóa');
  return users;
}
async function myProfile(userId) {
  try {
    return await CommunityProfile.findOneAndUpdate({ userId }, { $setOnInsert: { qrToken: randomBytes(24).toString('hex') } }, { upsert: true, new: true });
  } catch (err) { if (err.code !== 11000) throw err; return CommunityProfile.findOne({ userId }); }
}
async function access(userId, id, session, lock = false) {
  const filter = { _id: id, memberIds: userId };
  const c = lock ? await Conversation.findOneAndUpdate(filter, { $inc: { __v: 1 } }, { new: true, session })
    : await Conversation.findOne(filter).session(session || null);
  if (!c) throw notFound();
  const membership = await ConversationMember.findOne({ conversationId: id, userId }).session(session || null);
  if (!membership) throw notFound();
  return { c, membership };
}
function owner(c, userId) {
  if (c.kind !== 'GROUP' || c.ownerId !== userId) throw new AppError(403, 'GROUP_OWNER_REQUIRED', 'Chỉ chủ nhóm được quản lý nhóm');
}
function createSocialService(events) {
  function changed(c, type = 'conversation.updated', messageId, recipients = c.memberIds) {
    events.publish({ type, conversationId: String(c._id), ...(messageId ? { messageId: String(messageId) } : {}), recipientIds: [...recipients] });
  }
  async function dto(c, userId) {
    const users = await communityUsers({ userIds: c.memberIds });
    const membership = await ConversationMember.findOne({ conversationId: c._id, userId }).lean();
    const unreadCount = await Message.countDocuments({ conversationId: c._id, sequence: { $gt: membership?.readSequence || 0 }, senderId: { $ne: userId }, deleted: false });
    return { conversationId: String(c._id), kind: c.kind, name: c.name, ownerId: c.ownerId, members: c.memberIds.map(id => ({
      userId: id, name: users.find(u => u.id === id)?.name || 'Trekker', avatarUrl: users.find(u => u.id === id)?.avatarUrl || null,
    })), sequence: c.sequence, readSequence: membership?.readSequence || 0, unreadCount,
    disabled: c.disabled, moderationReason: c.moderationReason, lastMessageAt: c.lastMessageAt, createdAt: c.createdAt };
  }
  return {
    async profile(viewer, userId) {
      const [identity] = await communityUsers({ userIds: [userId] });
      if (!identity) throw notFound();
      const p = viewer === userId ? await myProfile(userId) : await CommunityProfile.findOne({ userId });
      const postCount = await Post.countDocuments({ ...visibleTo(viewer), authorId: userId });
      return { userId, name: identity.name, avatarUrl: identity.avatarUrl || null, bio: p?.bio || '', postCount, isMe: viewer === userId,
        ...(viewer === userId ? { qr: `trekviet://community/user/${p.qrToken}` } : {}) };
    },
    async updateProfile(userId, body) {
      await myProfile(userId);
      await CommunityProfile.updateOne({ userId }, { $set: { bio: body.bio } });
      return this.profile(userId, userId);
    },
    async rotateQr(userId) {
      await myProfile(userId);
      const p = await CommunityProfile.findOneAndUpdate({ userId }, { qrToken: randomBytes(24).toString('hex') }, { new: true });
      return { qr: `trekviet://community/user/${p.qrToken}` };
    },
    async discover(viewer, query) {
      let userId;
      if (query.email) userId = (await communityUsers({ email: query.email }))[0]?.id;
      else userId = (await CommunityProfile.findOne({ qrToken: query.qr.split('/').pop() }))?.userId;
      if (!userId) throw notFound();
      return this.profile(viewer, userId);
    },
    async direct(userId, target) {
      if (target === userId) fail('SELF_CHAT', 'Hãy chọn một người dùng khác');
      await membersExist([userId, target]);
      const ids = [userId, target].sort();
      let c;
      try {
        await mongoose.connection.transaction(async session => {
          c = await Conversation.findOne({ directKey: ids.join(':') }).session(session);
          if (c) return;
          [c] = await Conversation.create([{ kind: 'DIRECT', directKey: ids.join(':'), ownerId: userId, memberIds: ids }], { session });
          await ConversationMember.create(ids.map(id => ({ conversationId: c._id, userId: id })), { session });
        });
      } catch (err) { if (err.code !== 11000) throw err; c = await Conversation.findOne({ directKey: ids.join(':') }); }
      changed(c); return dto(c, userId);
    },
    async group(userId, body) {
      const ids = [...new Set([userId, ...body.memberIds])];
      if (ids.length < 2) fail('MEMBERS_REQUIRED', 'Nhóm cần ít nhất hai người');
      await membersExist(ids);
      let c;
      await mongoose.connection.transaction(async session => {
        [c] = await Conversation.create([{ kind: 'GROUP', name: body.name, ownerId: userId, memberIds: ids }], { session });
        await ConversationMember.create(ids.map(id => ({ conversationId: c._id, userId: id })), { session });
      });
      changed(c); return dto(c, userId);
    },
    async conversations(userId, query) {
      const result = await paginate(Conversation, { memberIds: userId }, query, { lastMessageAt: -1, _id: -1 });
      return { ...result, items: await Promise.all(result.items.map(c => dto(c, userId))) };
    },
    async conversation(userId, id) { return dto((await access(userId, id)).c, userId); },
    async editGroup(userId, id, body) {
      let c;
      await mongoose.connection.transaction(async session => {
        ({ c } = await access(userId, id, session, true)); owner(c, userId);
        if (c.disabled) fail('GROUP_DISABLED', 'Nhóm đang bị tạm ngưng');
        if (body.ownerId && !c.memberIds.includes(body.ownerId)) fail('NOT_MEMBER', 'Chủ mới phải là thành viên nhóm');
        Object.assign(c, body); await c.save({ session });
      });
      changed(c); return dto(c, userId);
    },
    async membership(userId, id, target, add) {
      if (add) await membersExist([target]);
      let c, recipients;
      await mongoose.connection.transaction(async session => {
        ({ c } = await access(userId, id, session, true));
        if (c.kind !== 'GROUP') throw new AppError(403, 'GROUP_REQUIRED', 'Không thể đổi thành viên chat riêng');
        if (add || target !== userId) owner(c, userId);
        if (c.disabled && add) fail('GROUP_DISABLED', 'Nhóm đang bị tạm ngưng');
        if (!add && c.ownerId === target) fail('TRANSFER_REQUIRED', 'Chuyển quyền chủ nhóm trước khi rời nhóm');
        recipients = [...c.memberIds];
        if (add && !c.memberIds.includes(target)) {
          if (c.memberIds.length >= 50) fail('GROUP_FULL', 'Nhóm tối đa 50 thành viên');
          c.memberIds.push(target); recipients.push(target);
          await ConversationMember.create([{ conversationId: id, userId: target, joinedSequence: c.sequence, readSequence: c.sequence }], { session });
        } else if (!add) {
          c.memberIds = c.memberIds.filter(value => value !== target);
          await ConversationMember.deleteOne({ conversationId: id, userId: target }, { session });
        }
        await c.save({ session });
      });
      changed(c, 'conversation.updated', null, recipients); return { conversationId: id };
    },
    async messages(userId, id, query) {
      const { membership } = await access(userId, id);
      const filter = { conversationId: id, sequence: { $gt: membership.joinedSequence, ...(query.before ? { $lt: query.before } : {}) } };
      const rows = await Message.find(filter).sort({ sequence: -1 }).limit(query.limit + 1).lean();
      const more = rows.length > query.limit; const items = rows.slice(0, query.limit);
      return { items: items.map(messageDto), nextBefore: more ? items[items.length - 1].sequence : null };
    },
    async send(userId, id, body) {
      let c, m;
      await mongoose.connection.transaction(async session => {
        ({ c } = await access(userId, id, session, true));
        m = await Message.findOne({ conversationId: id, senderId: userId, clientMessageId: body.clientMessageId }).session(session);
        if (m) { if (m.content !== body.content && !m.deleted) fail('KEY_REUSED', 'Mã gửi đã dùng cho nội dung khác'); return; }
        if (c.disabled) fail('GROUP_DISABLED', 'Hội thoại đang bị tạm ngưng');
        c.sequence++; c.lastMessageAt = new Date(); await c.save({ session });
        [m] = await Message.create([{ conversationId: id, senderId: userId, sequence: c.sequence, ...body }], { session });
        await ConversationMember.updateOne({ conversationId: id, userId }, { $max: { readSequence: c.sequence } }, { session });
      });
      changed(c, 'message.created', m._id); return messageDto(m);
    },
    async read(userId, id, sequence) {
      let c;
      await mongoose.connection.transaction(async session => {
        ({ c } = await access(userId, id, session, true));
        await ConversationMember.updateOne({ conversationId: id, userId }, { $max: { readSequence: Math.min(sequence, c.sequence) } }, { session });
      });
      changed(c, 'conversation.read'); return { conversationId: id };
    },
    async removeMessage(userId, id, messageId) {
      let c;
      await mongoose.connection.transaction(async session => {
        ({ c } = await access(userId, id, session, true));
        const m = await Message.findOne({ _id: messageId, conversationId: id }).session(session);
        if (!m) throw notFound();
        if (m.senderId !== userId) throw new AppError(403, 'NOT_AUTHOR', 'Chỉ được thu hồi tin của mình');
        m.deleted = true; m.content = ''; await m.save({ session });
      });
      changed(c, 'message.deleted', messageId); return { messageId };
    },
    async report(userId, id, messageId, reason) {
      let report;
      await mongoose.connection.transaction(async session => {
        const { membership } = await access(userId, id, session, true);
        const m = await Message.findOne({ _id: messageId, conversationId: id, deleted: false, sequence: { $gt: membership.joinedSequence } }).session(session);
        if (!m) throw notFound();
        report = await MessageReport.findOneAndUpdate({ reporterId: userId, messageId }, { $setOnInsert: {
          conversationId: id, senderId: m.senderId, contentSnapshot: m.content, reason,
        } }, { upsert: true, new: true, session });
      });
      return { reportId: String(report._id), status: report.status };
    },
    async adminGroups(query) {
      const result = await paginate(Conversation, { kind: 'GROUP', ...(query.disabled === undefined ? {} : { disabled: query.disabled }) }, query, { createdAt: -1, _id: -1 });
      return { ...result, items: result.items.map(c => ({ conversationId: String(c._id), name: c.name, ownerId: c.ownerId, memberCount: c.memberIds.length, disabled: c.disabled, moderationReason: c.moderationReason, createdAt: c.createdAt })) };
    },
    async moderateGroup(adminId, id, disabled, reason) {
      let c;
      await mongoose.connection.transaction(async session => {
        c = await Conversation.findOneAndUpdate({ _id: id, kind: 'GROUP' }, { $set: { disabled, moderationReason: reason }, $inc: { __v: 1 } }, { new: true, session });
        if (!c) throw notFound();
        await SocialModerationLog.create([{ adminId, entityId: id, action: disabled ? 'DISABLE_GROUP' : 'ENABLE_GROUP', reason }], { session });
      });
      changed(c); return { conversationId: id, disabled };
    },
    async reports(query) { return paginate(MessageReport, query.status ? { status: query.status } : {}, query, { createdAt: -1, _id: -1 }); },
    async resolveReport(adminId, id, body) {
      let c, report;
      await mongoose.connection.transaction(async session => {
        report = await MessageReport.findById(id).session(session);
        if (!report) throw notFound();
        if (report.status !== 'OPEN') fail('REPORT_CLOSED', 'Báo cáo đã xử lý');
        c = await Conversation.findByIdAndUpdate(report.conversationId, { $inc: { __v: 1 } }, { new: true, session });
        if (body.action === 'REMOVE') await Message.updateOne({ _id: report.messageId }, { $set: { content: '', deleted: true } }, { session });
        report.status = body.action === 'REMOVE' ? 'RESOLVED' : 'DISMISSED';
        report.resolution = body.reason; report.resolvedBy = adminId; report.resolvedAt = new Date(); await report.save({ session });
        await SocialModerationLog.create([{ adminId, entityId: id, action: body.action, reason: body.reason }], { session });
      });
      if (c && body.action === 'REMOVE') changed(c, 'message.deleted', report.messageId);
      return { reportId: id, status: report.status };
    },
  };
}
module.exports = { createSocialService };
