'use strict';
const { Schema, model } = require('mongoose');
const profile = new Schema({
  userId: { type: String, required: true, unique: true },
  bio: { type: String, default: '', maxlength: 500 },
  qrToken: { type: String, required: true, unique: true },
}, { timestamps: true, collection: 'community_profiles' });
const conversation = new Schema({
  kind: { type: String, enum: ['DIRECT', 'GROUP'], required: true },
  directKey: String,
  name: { type: String, default: '', maxlength: 100 },
  ownerId: { type: String, required: true },
  memberIds: { type: [String], required: true },
  // Sequence allocation and membership changes share one transactional fence.
  sequence: { type: Number, default: 0 },
  lastMessageAt: { type: Date, default: Date.now },
  disabled: { type: Boolean, default: false },
  moderationReason: { type: String, default: null },
}, { timestamps: true, collection: 'conversations' });
conversation.index({ directKey: 1 }, { unique: true, partialFilterExpression: { kind: 'DIRECT' } });
conversation.index({ memberIds: 1, lastMessageAt: -1, _id: -1 });
const member = new Schema({
  conversationId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: String, required: true },
  joinedSequence: { type: Number, default: 0 },
  readSequence: { type: Number, default: 0 },
}, { timestamps: true, collection: 'conversation_members' });
member.index({ conversationId: 1, userId: 1 }, { unique: true });
const message = new Schema({
  conversationId: { type: Schema.Types.ObjectId, required: true },
  senderId: { type: String, required: true },
  clientMessageId: { type: String, required: true, maxlength: 80 },
  sequence: { type: Number, required: true },
  content: { type: String, default: '', maxlength: 4000 },
  deleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'messages' });
message.index({ conversationId: 1, sequence: -1 }, { unique: true });
message.index({ conversationId: 1, senderId: 1, clientMessageId: 1 }, { unique: true });
const report = new Schema({
  reporterId: { type: String, required: true },
  messageId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, required: true },
  senderId: { type: String, required: true },
  contentSnapshot: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['OPEN', 'RESOLVED', 'DISMISSED'], default: 'OPEN' },
  resolution: String, resolvedBy: String, resolvedAt: Date,
}, { timestamps: true, collection: 'message_reports' });
report.index({ reporterId: 1, messageId: 1 }, { unique: true });
report.index({ status: 1, createdAt: -1 });
const action = new Schema({
  adminId: { type: String, required: true }, entityId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true }, reason: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'social_moderation_logs' });
module.exports = {
  CommunityProfile: model('CommunityProfile', profile), Conversation: model('Conversation', conversation),
  ConversationMember: model('ConversationMember', member), Message: model('Message', message),
  MessageReport: model('MessageReport', report), SocialModerationLog: model('SocialModerationLog', action),
};
