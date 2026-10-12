#!/usr/bin/env node
'use strict';

/**
 * Migration Script: Fix provinceId từ tên đầy đủ sang slug
 * 
 * Vấn đề: Web Admin trước đây gửi provinceId = "Lâm Đồng" (tên đầy đủ)
 * Backend lưu vào DB as-is → query filter không match
 * 
 * Script này:
 * 1. Scan tất cả TrekkingPlace có provinceId là tên đầy đủ
 * 2. Convert sang slug (lam_dong)
 * 3. Update DB
 * 
 * Usage:
 *   node src/scripts/migrate-province-ids.js [--dry-run]
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Province mapping: tên đầy đủ → slug
const PROVINCE_MAP = {
  'An Giang': 'an_giang',
  'Bà Rịa - Vũng Tàu': 'ba_ria_vung_tau',
  'Bắc Giang': 'bac_giang',
  'Bắc Kạn': 'bac_kan',
  'Bạc Liêu': 'bac_lieu',
  'Bắc Ninh': 'bac_ninh',
  'Bến Tre': 'ben_tre',
  'Bình Định': 'binh_dinh',
  'Bình Dương': 'binh_duong',
  'Bình Phước': 'binh_phuoc',
  'Bình Thuận': 'binh_thuan',
  'Cà Mau': 'ca_mau',
  'Cần Thơ': 'can_tho',
  'Cao Bằng': 'cao_bang',
  'Đà Nẵng': 'da_nang',
  'Đắk Lắk': 'dak_lak',
  'Đắk Nông': 'dak_nong',
  'Điện Biên': 'dien_bien',
  'Đồng Nai': 'dong_nai',
  'Đồng Tháp': 'dong_thap',
  'Gia Lai': 'gia_lai',
  'Hà Giang': 'ha_giang',
  'Hà Nam': 'ha_nam',
  'Hà Nội': 'ha_noi',
  'Hà Tĩnh': 'ha_tinh',
  'Hải Dương': 'hai_duong',
  'Hải Phòng': 'hai_phong',
  'Hậu Giang': 'hau_giang',
  'Hòa Bình': 'hoa_binh',
  'Hưng Yên': 'hung_yen',
  'Khánh Hòa': 'khanh_hoa',
  'Kiên Giang': 'kien_giang',
  'Kon Tum': 'kon_tum',
  'Lai Châu': 'lai_chau',
  'Lâm Đồng': 'lam_dong',
  'Lạng Sơn': 'lang_son',
  'Lào Cai': 'lao_cai',
  'Long An': 'long_an',
  'Nam Định': 'nam_dinh',
  'Nghệ An': 'nghe_an',
  'Ninh Bình': 'ninh_binh',
  'Ninh Thuận': 'ninh_thuan',
  'Phú Thọ': 'phu_tho',
  'Phú Yên': 'phu_yen',
  'Quảng Bình': 'quang_binh',
  'Quảng Nam': 'quang_nam',
  'Quảng Ngãi': 'quang_ngai',
  'Quảng Ninh': 'quang_ninh',
  'Quảng Trị': 'quang_tri',
  'Sóc Trăng': 'soc_trang',
  'Sơn La': 'son_la',
  'Tây Ninh': 'tay_ninh',
  'Thái Bình': 'thai_binh',
  'Thái Nguyên': 'thai_nguyen',
  'Thanh Hóa': 'thanh_hoa',
  'Thừa Thiên Huế': 'thua_thien_hue',
  'Tiền Giang': 'tien_giang',
  'TP. Hồ Chí Minh': 'ho_chi_minh',
  'Trà Vinh': 'tra_vinh',
  'Tuyên Quang': 'tuyen_quang',
  'Vĩnh Long': 'vinh_long',
  'Vĩnh Phúc': 'vinh_phuc',
  'Yên Bái': 'yen_bai',
};

// Reverse map để detect slug đã đúng
const SLUG_SET = new Set(Object.values(PROVINCE_MAP));

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('🔍 Province ID Migration Script');
  console.log('================================');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}\n`);

  // Connect to MongoDB
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trekvn';
  console.log(`Connecting to: ${MONGODB_URI}`);
  
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Connected to MongoDB\n');

  const TrekkingPlace = mongoose.model(
    'TrekkingPlace',
    new mongoose.Schema({}, { strict: false, collection: 'trekking_places' })
  );

  // Fetch all places
  const allPlaces = await TrekkingPlace.find({}).lean();
  console.log(`📊 Found ${allPlaces.length} places in database\n`);

  let fixedCount = 0;
  let alreadyCorrectCount = 0;
  let unknownCount = 0;

  for (const place of allPlaces) {
    const currentProvinceId = place.provinceId;
    
    // Check if already a valid slug
    if (SLUG_SET.has(currentProvinceId)) {
      alreadyCorrectCount++;
      continue;
    }

    // Check if it's a full name that needs conversion
    const correctSlug = PROVINCE_MAP[currentProvinceId];
    
    if (correctSlug) {
      console.log(`🔧 Fix: "${place.name}"`);
      console.log(`   OLD: provinceId = "${currentProvinceId}"`);
      console.log(`   NEW: provinceId = "${correctSlug}"`);
      
      if (!isDryRun) {
        await TrekkingPlace.updateOne(
          { _id: place._id },
          { $set: { provinceId: correctSlug } }
        );
        console.log(`   ✅ Updated\n`);
      } else {
        console.log(`   ⏭️  Skipped (dry run)\n`);
      }
      
      fixedCount++;
    } else {
      console.log(`⚠️  Unknown provinceId: "${currentProvinceId}" for place "${place.name}"`);
      unknownCount++;
    }
  }

  console.log('\n📈 Migration Summary');
  console.log('===================');
  console.log(`Total places:        ${allPlaces.length}`);
  console.log(`Already correct:     ${alreadyCorrectCount}`);
  console.log(`Fixed:               ${fixedCount}`);
  console.log(`Unknown/Skipped:     ${unknownCount}`);
  
  if (isDryRun && fixedCount > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else if (!isDryRun && fixedCount > 0) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log('\n✅ No changes needed - all provinceIds are correct!');
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
