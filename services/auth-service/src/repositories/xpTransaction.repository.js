const XpTransaction = require('../models/XpTransaction');

// ─── Tạo transaction mới ──────────────────────────────────────────────────────
// Trả về lỗi duplicate key nếu idempotencyKey đã tồn tại (chống cộng 2 lần).
const create = (data) => XpTransaction.create(data);

// ─── Lấy lịch sử XP theo userId, hỗ trợ cursor-based pagination ──────────────
// cursor: createdAt của item cuối cùng (ISO string hoặc Date object)
const findByUserIdPaginated = async (userId, { limit = 20, cursor = null } = {}) => {
  const query = { userId };

  if (cursor) {
    query.createdAt = { $lt: new Date(cursor) };
  }

  const items = await XpTransaction.find(query)
    .sort({ createdAt: -1 })
    .limit(limit + 1); // lấy thêm 1 để biết còn trang tiếp không

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  const nextCursor =
    hasMore ? data[data.length - 1].createdAt.toISOString() : null;

  return { data, nextCursor };
};

// ─── Kiểm tra idempotencyKey đã tồn tại chưa ─────────────────────────────────
const existsByIdempotencyKey = (key) =>
  XpTransaction.exists({ idempotencyKey: key });

// ─── Tổng XP của user (dùng để đối chiếu/kiểm tra) ───────────────────────────
const sumXpByUserId = async (userId) => {
  const result = await XpTransaction.aggregate([
    { $match: { userId: userId } },
    { $group: { _id: null, total: { $sum: '$xpAmount' } } },
  ]);
  return result[0]?.total ?? 0;
};

module.exports = {
  create,
  findByUserIdPaginated,
  existsByIdempotencyKey,
  sumXpByUserId,
};
