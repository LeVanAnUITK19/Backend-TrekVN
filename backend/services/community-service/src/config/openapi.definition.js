'use strict';
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: 'string' };
const date = { type: 'string', format: 'date-time' };
const count = { type: 'integer', minimum: 0 };
const nullableId = { type: 'string', nullable: true };
const post = { type: 'object', properties: {
  postId: string, authorId: string, authorName: string, authorAvatar: nullableId,
  content: string, images: { type: 'array', maxItems: 5, items: { type: 'string', format: 'uri' } },
  type: { type: 'string', enum: ['NORMAL', 'JOURNEY_SHARE', 'BADGE_SHARE'] },
  journeyId: nullableId, trekkingPlaceId: nullableId,
  reactionCount: count, commentCount: count, isLiked: { type: 'boolean' },
  visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] }, createdAt: date, updatedAt: date,
} };
const comment = { type: 'object', properties: {
  commentId: string, postId: string, authorId: nullableId, authorName: string,
  authorAvatar: nullableId, content: string, deleted: { type: 'boolean' }, hidden: { type: 'boolean' },
  parentCommentId: nullableId, rootCommentId: nullableId,
  likeCount: count, isLiked: { type: 'boolean' }, createdAt: date, updatedAt: date,
} };
const page = (name) => ({ type: 'object', properties: {
  items: { type: 'array', items: ref(name) }, total: count, page: count, limit: count, totalPages: count,
} });
const json = (schema) => ({ 'application/json': { schema } });
const result = (data) => ({ type: 'object', properties: { success: { type: 'boolean', enum: [true] }, ...(data ? { data } : {}) } });
const inputPost = { type: 'object', additionalProperties: false, properties: {
  ...Object.fromEntries(['content', 'images', 'type', 'journeyId', 'trekkingPlaceId', 'visibility'].map((key) => [key, post.properties[key]])),
} };
inputPost.properties.content = { type: 'string', maxLength: 10000 };
const commentInput = { type: 'object', additionalProperties: false, required: ['content'], properties: {
  content: { type: 'string', minLength: 1, maxLength: 2000 }, parentCommentId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
} };
const parameters = (url) => [...url.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }));
const pagination = [{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }];
const paths = {};
function operation(url, method, summary, data, body, created = false) {
  paths[url] ||= {};
  paths[url][method] = {
    summary, tags: [url.includes('comments') ? 'Comments' : 'Posts'], security: [{ bearerAuth: [] }],
    parameters: parameters(url),
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      [created ? '201' : '200']: { description: 'Success', content: json(result(data)) },
      '400': { description: 'Invalid input' }, '401': { description: 'Missing or expired access token' },
      '403': { description: 'Only the author can edit; post authors can remove comments' },
      '404': { description: 'Missing, deleted or inaccessible content' },
      '409': { description: 'Linked resource was concurrently edited; reload and retry' },
      '429': { description: 'Rate limit exceeded; respect Retry-After' },
    },
  };
}
operation('/api/v1/posts', 'get', 'Newest public posts and caller-owned private posts', page('Post'));
paths['/api/v1/posts'].get.parameters = [...pagination, ...['userId', 'type', 'trekkingPlaceId'].map((name) => ({ name, in: 'query', schema: string }))];
operation('/api/v1/posts', 'post', 'Create post (text or up to five HTTPS images)', ref('Post'), inputPost, true);
operation('/api/v1/posts/{postId}', 'get', 'Read accessible post', ref('Post'));
for (const method of ['put', 'patch']) operation('/api/v1/posts/{postId}', method, 'Partially update own post', ref('Post'), inputPost);
operation('/api/v1/posts/{postId}', 'delete', 'Soft delete own post and redact descendants');
for (const method of ['post', 'delete']) operation('/api/v1/posts/{postId}/like', method,
  method === 'post' ? 'Ensure post is liked (idempotent)' : 'Ensure post is not liked (idempotent)',
  { type: 'object', properties: { postId: string, isLiked: { type: 'boolean' }, reactionCount: count } });
operation('/api/v1/posts/{postId}/comments', 'get', 'Comments in oldest-first order, including redacted tombstones', page('Comment'));
paths['/api/v1/posts/{postId}/comments'].get.parameters.push(...pagination.map((p) => p.name === 'limit' ? { ...p, schema: { ...p.schema, default: 50 } } : p));
operation('/api/v1/posts/{postId}/comments', 'post', 'Create comment or nested reply in the same post', ref('Comment'), commentInput, true);
for (const method of ['put', 'patch']) operation('/api/v1/comments/{commentId}', method, 'Edit own comment', ref('Comment'),
  { ...commentInput, properties: { content: commentInput.properties.content } });
operation('/api/v1/comments/{commentId}', 'delete', 'Redact own comment or moderate a comment on own post');
for (const method of ['post', 'delete']) operation('/api/v1/comments/{commentId}/like', method,
  method === 'post' ? 'Ensure comment is liked (idempotent)' : 'Ensure comment is not liked (idempotent)',
  { type: 'object', properties: { commentId: string, isLiked: { type: 'boolean' }, likeCount: count } });
const status = { type: 'string', enum: ['ACTIVE', 'HIDDEN', 'DELETED'] };
const moderation = { status, moderationReason: nullableId, moderatedBy: nullableId, moderatedAt: { ...date, nullable: true } };
const adminPost = { type: 'object', properties: { ...post.properties, ...moderation } };
const adminComment = { type: 'object', properties: { ...comment.properties, ...moderation, postContent: string, postStatus: status } };
const log = { type: 'object', properties: {
  logId: string, adminId: string, entityType: { type: 'string', enum: ['POST', 'COMMENT'] }, entityId: string,
  action: { type: 'string', enum: ['HIDE', 'PUBLISH', 'DELETE'] }, reason: string,
  beforeStatus: status, afterStatus: status, createdAt: date,
} };
const reason = { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 1000 } } };
const adminBase = '/api/v1/admin/community';
for (const entity of ['posts', 'comments']) {
  const name = entity === 'posts' ? 'AdminPost' : 'AdminComment';
  operation(`${adminBase}/${entity}`, 'get', `ADMIN: paginated ${entity}, including private, hidden and deleted records`, page(name));
  paths[`${adminBase}/${entity}`].get.parameters.push(...pagination,
    ...['search', 'authorId', ...(entity === 'posts' ? ['type', 'visibility'] : ['postId'])].map(name => ({ name, in: 'query', schema: string })),
    { name: 'status', in: 'query', schema: status });
  const itemPath = `${adminBase}/${entity}/{${entity === 'posts' ? 'postId' : 'commentId'}}`;
  for (const action of ['hide', 'publish']) operation(`${itemPath}/${action}`, 'patch',
    `ADMIN: ${action === 'hide' ? 'hide content' : 'restore hidden content with original privacy'}; requires a reason`, ref(name), reason);
  operation(itemPath, 'delete', 'ADMIN: redact content permanently, preserving tombstone; requires a reason', ref(name), reason);
}
operation(`${adminBase}/posts/{postId}`, 'get', 'ADMIN: full post and last 20 moderation actions for this post and its comments',
  { type: 'object', properties: { post: ref('AdminPost'), recentActions: { type: 'array', items: ref('ModerationLog') } } });
for (const [url, methods] of Object.entries(paths)) {
  if (!url.startsWith(adminBase)) continue;
  for (const op of Object.values(methods)) {
    op.tags = ['Community administration'];
    op.description = 'Requires a current ADMIN session verified with auth-service, including direct service calls. Every state transition and its local moderation log commit atomically. Hidden content cannot be accessed via app APIs. DELETE cannot be restored. Repeated same-state actions are idempotent.';
    op.responses['403'] = { description: 'Current account does not have ADMIN role' };
    op.responses['503'] = { description: 'Auth service unavailable; access fails closed' };
  }
}
const social = require('./social.openapi');
module.exports = {
  openapi: '3.0.0', info: { title: 'Community Service', version: '1.0.0',
    description: 'JWT-protected community REST API. Realtime invalidations: ws(s)://gateway/api/v1/community/ws; authenticate with first JSON frame {type: auth, token: accessToken}. See community-service-api.md.' },
  servers: [{ url: 'http://localhost:3004' }], paths: { ...paths, ...social.paths },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas: { Post: post, Comment: comment, AdminPost: adminPost, AdminComment: adminComment, ModerationLog: log, ...social.schemas } },
};
