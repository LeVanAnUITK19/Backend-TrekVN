#!/usr/bin/env node
'use strict';

/**
 * seedOfflineMaps.js
 *
 * Cập nhật offlineMap.objectKey cho 4 tuyến đường chính của TrekVN.
 * Script dùng slug để tìm route, sau đó upsert offlineMap với objectKey mới.
 *
 * Chạy:
 *   node src/scripts/seedOfflineMaps.js
 *
 * Hoặc với env cụ thể:
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/seedOfflineMaps.js
 *
 * Lưu ý:
 * - Script chỉ cập nhật offlineMap, KHÔNG tạo mới Place / Route.
 * - Nếu không tìm thấy route theo slug → log warning và bỏ qua.
 * - downloadUrl KHÔNG lưu trong DB; build runtime bằng buildR2Url().
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const TrekkingRoute = require('../models/TrekkingRoute');
const TrekkingPlace = require('../models/TrekkingPlace');
const { buildR2Url } = require('../config/r2');

// ─── Cấu hình offline map cho từng tuyến ─────────────────────────────────────
// objectKey convention: <place-slug>/v<N>/<place-slug>-v<N>-flutter.zip
//
// Khi update lên v2:
//   objectKey: "ba-den/v2/ba-den-v2-flutter.zip"
//   version:   2
// ─────────────────────────────────────────────────────────────────────────────
const OFFLINE_MAP_SEEDS = [
  {
    placeSlug: 'nui-ba-den',        // slug của TrekkingPlace
    routeNameContains: 'Bà Đen',    // tìm route theo tên (partial match, case-insensitive)
    offlineMap: {
      available: true,
      version: 1,
      objectKey: 'ba-den/v1/ba-den-v1-flutter.zip',
      sizeBytes: 0,
      checksum: '',
      minZoom: 8,
      maxZoom: 14,
      bounds: {
        minLat: 11.361570,
        minLon: 106.139430,
        maxLat: 11.412390,
        maxLon: 106.191620,
      },
    },
  },
  {
    placeSlug: 'nui-langbiang',
    routeNameContains: 'Langbiang',
    offlineMap: {
      available: true,
      version: 1,
      objectKey: 'langbiang/v1/langbiang-v1-flutter.zip',
      sizeBytes: 0,
      checksum: '',
      minZoom: 10,
      maxZoom: 16,
      bounds: {
        minLat: 11.900000,
        minLon: 108.300000,
        maxLat: 12.200000,
        maxLon: 108.600000,
      },
    },
  },
  {
    placeSlug: 'nui-fansipan',
    routeNameContains: 'Fansipan',
    offlineMap: {
      available: true,
      version: 1,
      objectKey: 'fansipan/v1/fansipan-v1-flutter.zip',
      sizeBytes: 0,
      checksum: '',
      minZoom: 10,
      maxZoom: 16,
      bounds: {
        minLat: 22.280000,
        minLon: 103.740000,
        maxLat: 22.380000,
        maxLon: 103.820000,
      },
    },
  },
  {
    placeSlug: 'ta-nang-phan-dung',
    routeNameContains: 'Tà Năng',
    offlineMap: {
      available: true,
      version: 1,
      objectKey: 'ta-nang-phan-dung/v1/ta-nang-phan-dung-v1-flutter.zip',
      sizeBytes: 0,
      checksum: '',
      minZoom: 9,
      maxZoom: 15,
      bounds: {
        minLat: 11.530000,
        minLon: 108.150000,
        maxLat: 11.720000,
        maxLon: 108.450000,
      },
    },
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI không được set. Kiểm tra .env');
    process.exit(1);
  }

  console.log('🔌  Kết nối MongoDB...');
  await mongoose.connect(uri);
  console.log('✅  MongoDB connected\n');

  let updated = 0;
  let skipped = 0;

  for (const seed of OFFLINE_MAP_SEEDS) {
    const { placeSlug, routeNameContains, offlineMap } = seed;

    // 1. Tìm Place theo slug
    const place = await TrekkingPlace.findOne({ slug: placeSlug });
    if (!place) {
      console.warn(`⚠️   Place slug "${placeSlug}" không tìm thấy → bỏ qua`);
      skipped++;
      continue;
    }

    // 2. Tìm Route đầu tiên của Place khớp tên (ACTIVE)
    const route = await TrekkingRoute.findOne({
      trekkingPlaceId: place._id,
      name: { $regex: routeNameContains, $options: 'i' },
      status: 'ACTIVE',
    });

    if (!route) {
      console.warn(`⚠️   Route "${routeNameContains}" của Place "${place.name}" không tìm thấy → bỏ qua`);
      skipped++;
      continue;
    }

    // 3. Cập nhật offlineMap
    await TrekkingRoute.findByIdAndUpdate(
      route._id,
      { $set: { offlineMap } },
      { runValidators: true }
    );

    const downloadUrl = buildR2Url(offlineMap.objectKey);
    console.log(`✅  [${place.name}] Route "${route.name}"`);
    console.log(`    objectKey  : ${offlineMap.objectKey}`);
    console.log(`    version    : ${offlineMap.version}`);
    console.log(`    downloadUrl: ${downloadUrl}`);
    console.log('');
    updated++;
  }

  console.log(`\n📊  Kết quả: ${updated} updated, ${skipped} skipped`);

  await mongoose.disconnect();
  console.log('🔌  MongoDB disconnected. Done.');
  process.exit(0);
};

run().catch((err) => {
  console.error('❌  Lỗi:', err.message);
  mongoose.disconnect().finally(() => process.exit(1));
});
