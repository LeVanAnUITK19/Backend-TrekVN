/**
 * seedRanks.js — Seed 10 rank definitions vào MongoDB.
 *
 * Chạy một lần trước khi deploy:
 *   node src/scripts/seedRanks.js
 *
 * Script an toàn để chạy nhiều lần (upsert theo code).
 * Yêu cầu biến môi trường MONGODB_URI.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RankDefinition = require('../models/RankDefinition');

// ─── Dữ liệu 10 rank — theo SRS v4.0 FR-RANK-16 ─────────────────────────────
// Điều kiện chính: minXp + minCompletedJourneys + minVisitedProvinces + minBadgeCount
// minDistanceMeters / minApprovedContributions = 0 (extension conditions, mặc định không bật)
const RANKS = [
  {
    code: 'NEWBIE',
    name: 'Newbie',
    level: 1,
    description: 'Người mới bắt đầu hành trình trekking.',
    minXp: 0,
    minCompletedJourneys: 0,
    minVisitedProvinces: 0,
    minBadgeCount: 0,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'HIKER',
    name: 'Hiker',
    level: 2,
    description: 'Đã bắt đầu khám phá những con đường trekking đầu tiên.',
    minXp: 500,
    minCompletedJourneys: 2,
    minVisitedProvinces: 1,
    minBadgeCount: 1,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'EXPLORER',
    name: 'Explorer',
    level: 3,
    description: 'Đang khám phá nhiều địa điểm trekking đa dạng.',
    minXp: 1500,
    minCompletedJourneys: 5,
    minVisitedProvinces: 2,
    minBadgeCount: 3,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'TREKKER',
    name: 'Trekker',
    level: 4,
    description: 'Đã có kinh nghiệm trekking đáng kể trên nhiều địa hình.',
    minXp: 3500,
    minCompletedJourneys: 10,
    minVisitedProvinces: 3,
    minBadgeCount: 5,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'PATHFINDER',
    name: 'Pathfinder',
    level: 5,
    description: 'Người tìm đường — có tầm nhìn rộng về địa hình Việt Nam.',
    minXp: 7000,
    minCompletedJourneys: 20,
    minVisitedProvinces: 5,
    minBadgeCount: 8,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'MOUNTAINEER',
    name: 'Mountaineer',
    level: 6,
    description: 'Người trekking có nhiều kinh nghiệm chinh phục địa hình khó.',
    minXp: 12000,
    minCompletedJourneys: 30,
    minVisitedProvinces: 8,
    minBadgeCount: 12,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'ADVENTURER',
    name: 'Adventurer',
    level: 7,
    description: 'Nhà phiêu lưu thực thụ — không ngại thử thách mới.',
    minXp: 20000,
    minCompletedJourneys: 45,
    minVisitedProvinces: 12,
    minBadgeCount: 18,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'ELITE_TREKKER',
    name: 'Elite Trekker',
    level: 8,
    description: 'Trekker tinh hoa — được cộng đồng công nhận.',
    minXp: 32000,
    minCompletedJourneys: 65,
    minVisitedProvinces: 18,
    minBadgeCount: 25,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'TREK_MASTER',
    name: 'Trek Master',
    level: 9,
    description: 'Bậc thầy trekking — am hiểu mọi địa hình từ Bắc vào Nam.',
    minXp: 50000,
    minCompletedJourneys: 90,
    minVisitedProvinces: 25,
    minBadgeCount: 35,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
  {
    code: 'TREK_LEGEND',
    name: 'Trek Legend',
    level: 10,
    description: 'Huyền thoại trekking Việt Nam — biểu tượng của cộng đồng.',
    minXp: 80000, // SRS v4.0 FR-RANK-16: Trek Legend = 80000 XP
    minCompletedJourneys: 120,
    minVisitedProvinces: 30,
    minBadgeCount: 50,
    minDistanceMeters: 0,
    minApprovedContributions: 0,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const seed = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI không được thiết lập');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅  Kết nối MongoDB thành công');

  let created = 0;
  let updated = 0;

  for (const rank of RANKS) {
    const result = await RankDefinition.findOneAndUpdate(
      { code: rank.code },
      { $set: rank },
      { upsert: true, new: true, runValidators: true }
    );
    // Mongoose upsert: nếu _id đã tồn tại thì là update, ngược lại là create
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
      console.log(`  ➕  Created: ${rank.code} (level ${rank.level})`);
    } else {
      updated++;
      console.log(`  🔄  Updated: ${rank.code} (level ${rank.level})`);
    }
  }

  console.log(`\n✅  Seed hoàn tất — ${created} created, ${updated} updated`);
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('❌  Seed thất bại:', err.message);
  process.exit(1);
});
