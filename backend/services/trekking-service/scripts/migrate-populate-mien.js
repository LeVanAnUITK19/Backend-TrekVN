#!/usr/bin/env node
'use strict';

/**
 * Migration Script: Populate mien field for TrekkingPlace
 * 
 * This script populates the new `mien` field (mien-bac, mien-trung, mien-nam)
 * for all existing trekking places based on their province's region.
 * 
 * Run: node scripts/migrate-populate-mien.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const TrekkingPlace = require('../src/models/TrekkingPlace');

// Province → Region mapping (based on checkin-service Province.region enum)
// NORTH → mien-bac, CENTRAL → mien-trung, SOUTH → mien-nam
const PROVINCE_REGION_MAP = {
  // Miền Bắc (NORTH → mien-bac)
  'ha_noi': 'mien-bac',
  'hai_phong': 'mien-bac',
  'quang_ninh': 'mien-bac',
  'bac_giang': 'mien-bac',
  'bac_kan': 'mien-bac',
  'bac_ninh': 'mien-bac',
  'cao_bang': 'mien-bac',
  'dien_bien': 'mien-bac',
  'ha_giang': 'mien-bac',
  'ha_nam': 'mien-bac',
  'hai_duong': 'mien-bac',
  'hoa_binh': 'mien-bac',
  'hung_yen': 'mien-bac',
  'lai_chau': 'mien-bac',
  'lang_son': 'mien-bac',
  'lao_cai': 'mien-bac',
  'nam_dinh': 'mien-bac',
  'ninh_binh': 'mien-bac',
  'phu_tho': 'mien-bac',
  'son_la': 'mien-bac',
  'thai_binh': 'mien-bac',
  'thai_nguyen': 'mien-bac',
  'tuyen_quang': 'mien-bac',
  'vinh_phuc': 'mien-bac',
  'yen_bai': 'mien-bac',
  
  // Miền Trung (CENTRAL → mien-trung)
  'thanh_hoa': 'mien-trung',
  'nghe_an': 'mien-trung',
  'ha_tinh': 'mien-trung',
  'quang_binh': 'mien-trung',
  'quang_tri': 'mien-trung',
  'thua_thien_hue': 'mien-trung',
  'da_nang': 'mien-trung',
  'quang_nam': 'mien-trung',
  'quang_ngai': 'mien-trung',
  'binh_dinh': 'mien-trung',
  'phu_yen': 'mien-trung',
  'khanh_hoa': 'mien-trung',
  'ninh_thuan': 'mien-trung',
  'binh_thuan': 'mien-trung',
  'kon_tum': 'mien-trung',
  'gia_lai': 'mien-trung',
  'dak_lak': 'mien-trung',
  'dak_nong': 'mien-trung',
  'lam_dong': 'mien-trung',
  
  // Miền Nam (SOUTH → mien-nam)
  'ho_chi_minh': 'mien-nam',
  'ba_ria_vung_tau': 'mien-nam',
  'binh_duong': 'mien-nam',
  'binh_phuoc': 'mien-nam',
  'dong_nai': 'mien-nam',
  'tay_ninh': 'mien-nam',
  'an_giang': 'mien-nam',
  'bac_lieu': 'mien-nam',
  'ben_tre': 'mien-nam',
  'ca_mau': 'mien-nam',
  'can_tho': 'mien-nam',
  'dong_thap': 'mien-nam',
  'hau_giang': 'mien-nam',
  'kien_giang': 'mien-nam',
  'long_an': 'mien-nam',
  'soc_trang': 'mien-nam',
  'tien_giang': 'mien-nam',
  'tra_vinh': 'mien-nam',
  'vinh_long': 'mien-nam',
};

async function migrate() {
  try {
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trekking';
    console.log('🔌 Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all places
    const places = await TrekkingPlace.find({});
    console.log(`📍 Found ${places.length} trekking places to migrate\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const place of places) {
      try {
        // Skip if mien is already set
        if (place.mien) {
          console.log(`⏭️  Skipped: ${place.name} (mien already set: ${place.mien})`);
          skippedCount++;
          continue;
        }

        // Look up region based on provinceId
        const mien = PROVINCE_REGION_MAP[place.provinceId];
        
        if (!mien) {
          console.warn(`⚠️  Warning: Unknown provinceId "${place.provinceId}" for place: ${place.name}`);
          errorCount++;
          continue;
        }

        // Update the place
        place.mien = mien;
        await place.save();
        
        console.log(`✅ Updated: ${place.name} → ${mien} (province: ${place.provinceId})`);
        updatedCount++;
      } catch (err) {
        console.error(`❌ Error updating place ${place._id}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Total places: ${places.length}`);
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped (already set): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
