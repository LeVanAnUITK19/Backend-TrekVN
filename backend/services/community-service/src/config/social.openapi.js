'use strict';
const str = { type: 'string' }, number = { type: 'integer', minimum: 0 }, date = { type: 'string', format: 'date-time' };
const id = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', properties });
const array = items => ({ type: 'array', items });
const paged = name => object({ items: array(ref(name)), page: number, limit: number, total: number, totalPages: number });
const schemas = {
  CommunityProfile: object({ userId: id, name: str, avatarUrl: { ...str, nullable: true }, bio: str, postCount: number, isMe: { type: 'boolean' },
    qr: { ...str, description: 'Only included for the owner. Opaque, rotatable QR, never an access token or email.' } }),
  Conversation: object({ conversationId: id, kind: { type: 'string', enum: ['DIRECT', 'GROUP'] }, name: str, ownerId: id,
    members: array(object({ userId: id, name: str, avatarUrl: { ...str, nullable: true } })), sequence: number, readSequence: number,
    unreadCount: number, disabled: { type: 'boolean' }, moderationReason: { ...str, nullable: true }, lastMessageAt: date, createdAt: date }),
  Message: object({ messageId: id, conversationId: id, senderId: id, sequence: number, clientMessageId: str,
    content: str, deleted: { type: 'boolean' }, createdAt: date }),
  CommunityGroup: object({ conversationId: id, name: str, ownerId: id, memberCount: number, disabled: { type: 'boolean' }, moderationReason: { ...str, nullable: true }, createdAt: date }),
  MessageReport: object({ _id: id, reporterId: id, messageId: id, conversationId: id, senderId: id, contentSnapshot: str, reason: str,
    status: { type: 'string', enum: ['OPEN', 'RESOLVED', 'DISMISSED'] }, resolution: str, resolvedBy: id, resolvedAt: date, createdAt: date, updatedAt: date }),
};
const paths = {};
const json = schema => ({ 'application/json': { schema } });
function op(path, method, summary, data, description = '', body) {
  paths[path] ||= {};
  paths[path][method] = { summary, description, tags: [path.includes('/admin/') ? 'Messaging administration' : 'Community profiles and messaging'], security: [{ bearerAuth: [] }],
    parameters: [...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: id })),
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}), responses: {
      '200': { description: 'Success', content: json(object({ success: { type: 'boolean' }, data })) },
      '400': { description: 'Invalid body/query/ID or unavailable target account' }, '401': { description: 'Missing or revoked current session' },
      '403': { description: 'Group owner / message author / current ADMIN role required' }, '404': { description: 'Not found or not a current member; existence is not disclosed' },
      '409': { description: 'Group disabled/full, owner transfer required, reused send key or report already closed' },
      '429': { description: 'User request quota exceeded' }, '503': { description: 'Auth or identity lookup unavailable' },
    } };
}
const base = '/api/v1/community', admin = '/api/v1/admin/community';
const pagination = [{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }];
op(`${base}/people/me`, 'get', 'Own community profile and personal QR', ref('CommunityProfile'));
op(`${base}/people/me`, 'patch', 'Edit own community introduction', ref('CommunityProfile'), 'Name/avatar are owned by auth-service; edit through existing account profile APIs. Bio length 0–500.');
op(`${base}/people/me/qr`, 'post', 'Rotate personal QR and invalidate the old one', object({ qr: str }));
op(`${base}/people/discover`, 'get', 'Find active user by exact email OR personal QR', ref('CommunityProfile'), 'Exactly one query is required. Does not return email. All users may find and message each other without friendship.');
paths[`${base}/people/discover`].get.parameters = [{ name: 'email', in: 'query', schema: { type: 'string', format: 'email', maxLength: 254 } }, { name: 'qr', in: 'query', schema: { type: 'string', pattern: '^trekviet://community/user/[a-f0-9]{48}$' } }];
op(`${base}/people/{userId}`, 'get', 'Public community profile', ref('CommunityProfile'), 'Authenticated viewers see name, avatar, bio, accessible post count. Never exposes QR or email. Posts use GET /api/v1/posts?userId=... with existing privacy checks.');
op(`${base}/conversations`, 'get', 'List own conversations and unread counts', paged('Conversation'));
paths[`${base}/conversations`].get.parameters = pagination;
op(`${base}/conversations/direct`, 'post', 'Get or create unique direct conversation', ref('Conversation'), 'userId required. Concurrent calls for the same unordered pair return the same conversation. Self chat is rejected.');
op(`${base}/conversations/groups`, 'post', 'Create group with name and selected users', ref('Conversation'), 'name 1–100, memberIds unique list of 1–49 IDs. Creator automatically joins and becomes owner; maximum total 50.');
op(`${base}/conversations/{conversationId}`, 'get', 'Conversation visible only to current members', ref('Conversation'));
op(`${base}/conversations/{conversationId}`, 'patch', 'Owner: rename group or transfer ownership', ref('Conversation'), 'name and/or ownerId. New owner must already be a member. Cannot change a direct conversation.');
op(`${base}/conversations/{conversationId}/members`, 'post', 'Owner: add an active user to group', object({ conversationId: id }), 'userId required. Added/re-added users see only messages after their current join sequence.');
op(`${base}/conversations/{conversationId}/members/{userId}`, 'delete', 'Owner removes member, or member leaves group', object({ conversationId: id }), 'Owner must transfer ownership before leaving. Removed users lose read/send/list access.');
op(`${base}/conversations/{conversationId}/messages`, 'get', 'Newest-first cursor pagination of chat messages', object({ items: array(ref('Message')), nextBefore: { ...number, nullable: true } }), 'Stable descending sequence. nextBefore is the exclusive cursor for older messages, null at the end. Tombstones retain sequence; history starts at current membership join sequence.');
paths[`${base}/conversations/{conversationId}/messages`].get.parameters.push({ name: 'before', in: 'query', schema: { type: 'integer', minimum: 1 } }, pagination[1]);
op(`${base}/conversations/{conversationId}/messages`, 'post', 'Send plain text message with retry key', ref('Message'), 'content 1–4000 after trim. clientMessageId 8–80 alphanumeric, underscore or hyphen. Unique per conversation/sender: retry identical key/content returns original; changing content with same key returns 409. Transactional sequence + membership fence.');
op(`${base}/conversations/{conversationId}/read`, 'post', 'Advance own read cursor monotonically', object({ conversationId: id }), 'sequence >=0 is clamped to the latest committed sequence; cannot move backwards. Unread excludes own/recalled messages.');
op(`${base}/conversations/{conversationId}/messages/{messageId}`, 'delete', 'Author recalls own message for all members', object({ messageId: id }), 'Redacts content permanently, preserving sequence and tombstone.');
op(`${base}/conversations/{conversationId}/messages/{messageId}/report`, 'post', 'Member reports one accessible message to administrators', object({ reportId: id, status: str }), 'reason 3–1000 required. Stores reported content snapshot, not surrounding chat. One report per reporter/message.');
op(`${admin}/groups`, 'get', 'ADMIN: groups metadata only', paged('CommunityGroup'), 'No direct conversations or messages. Optional disabled=true|false.');
paths[`${admin}/groups`].get.parameters = [...pagination, { name: 'disabled', in: 'query', schema: { type: 'boolean' } }];
for (const action of ['enable', 'disable']) op(`${admin}/groups/{conversationId}/${action}`, 'patch', `ADMIN: ${action} group`, object({ conversationId: id, disabled: { type: 'boolean' } }), 'reason 3–1000 required; state + social moderation log commit atomically. Disabled group remains readable but cannot send/add/edit.');
op(`${admin}/message-reports`, 'get', 'ADMIN: reported message snapshots only', paged('MessageReport'));
paths[`${admin}/message-reports`].get.parameters = [...pagination, { name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'RESOLVED', 'DISMISSED'] } }];
op(`${admin}/message-reports/{reportId}`, 'patch', 'ADMIN: remove reported message or dismiss report', object({ reportId: id, status: str }), 'action REMOVE|DISMISS and reason 3–1000. REMOVE redacts message; reports preserve submitted evidence. Resolution + audit are atomic.');
const validators = require('../validators/social.validator');
const convert = require('./joi-schema');
for (const [path, method, validator] of [
  [`${base}/people/me`, 'patch', 'profile'],
  [`${base}/conversations/direct`, 'post', 'direct'], [`${base}/conversations/groups`, 'post', 'group'],
  [`${base}/conversations/{conversationId}`, 'patch', 'groupEdit'],
  [`${base}/conversations/{conversationId}/members`, 'post', 'member'],
  [`${base}/conversations/{conversationId}/messages`, 'post', 'message'], [`${base}/conversations/{conversationId}/read`, 'post', 'read'],
  [`${base}/conversations/{conversationId}/messages/{messageId}/report`, 'post', 'reason'],
  [`${admin}/groups/{conversationId}/disable`, 'patch', 'reason'], [`${admin}/groups/{conversationId}/enable`, 'patch', 'reason'],
  [`${admin}/message-reports/{reportId}`, 'patch', 'resolve'],
]) paths[path][method].requestBody = { required: true, content: json(convert(validators[validator].describe())) };
module.exports = { paths, schemas };
