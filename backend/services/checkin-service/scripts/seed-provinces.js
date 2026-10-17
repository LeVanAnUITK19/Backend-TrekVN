'use strict';

/**
 * Seed 34 tỉnh/thành phố vào collection provinces.
 * Chạy: node scripts/seed-provinces.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Province = require('../src/models/Province');

const PROVINCES = [
  { code: 'can_tho',        name: 'Cần Thơ',          region: 'SOUTH',   mapFeatureId: 'VN-CT' },
  { code: 'an_giang',       name: 'An Giang',          region: 'SOUTH',   mapFeatureId: 'VN-AG' },
  { code: 'dong_thap',      name: 'Đồng Tháp',         region: 'SOUTH',   mapFeatureId: 'VN-DT' },
  { code: 'da_nang',        name: 'Đà Nẵng',           region: 'CENTRAL', mapFeatureId: 'VN-DN' },
  { code: 'thua_thien_hue', name: 'Huế',               region: 'CENTRAL', mapFeatureId: 'VN-TH' },
  { code: 'quang_tri',      name: 'Quảng Trị',         region: 'CENTRAL', mapFeatureId: 'VN-QT' },
  { code: 'ha_tinh',        name: 'Hà Tĩnh',           region: 'CENTRAL', mapFeatureId: 'VN-HT' },
  { code: 'nghe_an',        name: 'Nghệ An',           region: 'CENTRAL', mapFeatureId: 'VN-NA' },
  { code: 'thanh_hoa',      name: 'Thanh Hóa',         region: 'CENTRAL', mapFeatureId: 'VN-TH2' },
  { code: 'son_la',         name: 'Sơn La',            region: 'NORTH',   mapFeatureId: 'VN-SL' },
  { code: 'dien_bien',      name: 'Điện Biên',         region: 'NORTH',   mapFeatureId: 'VN-DB' },
  { code: 'tuyen_quang',    name: 'Tuyên Quang',       region: 'NORTH',   mapFeatureId: 'VN-TQ' },
  { code: 'thai_nguyen',    name: 'Thái Nguyên',       region: 'NORTH',   mapFeatureId: 'VN-TN' },
  { code: 'cao_bang',       name: 'Cao Bằng',          region: 'NORTH',   mapFeatureId: 'VN-CB' },
  { code: 'quang_ninh',     name: 'Quảng Ninh',        region: 'NORTH',   mapFeatureId: 'VN-QN' },
  { code: 'lai_chau',       name: 'Lai Châu',          region: 'NORTH',   mapFeatureId: 'VN-LC' },
  { code: 'lao_cai',        name: 'Lào Cai',           region: 'NORTH',   mapFeatureId: 'VN-LCI' },
  { code: 'bac_ninh',       name: 'Bắc Ninh',          region: 'NORTH',   mapFeatureId: 'VN-BN' },
  { code: 'phu_tho',        name: 'Phú Thọ',           region: 'NORTH',   mapFeatureId: 'VN-PT' },
  { code: 'hai_phong',      name: 'Hải Phòng',         region: 'NORTH',   mapFeatureId: 'VN-HP' },
  { code: 'hung_yen',       name: 'Hưng Yên',          region: 'NORTH',   mapFeatureId: 'VN-HY' },
  { code: 'ninh_binh',      name: 'Ninh Bình',         region: 'NORTH',   mapFeatureId: 'VN-NB' },
  { code: 'ha_noi',         name: 'Hà Nội',            region: 'NORTH',   mapFeatureId: 'VN-HN' },
  { code: 'ca_mau',         name: 'Cà Mau',            region: 'SOUTH',   mapFeatureId: 'VN-CM' },
  { code: 'vinh_long',      name: 'Vĩnh Long',         region: 'SOUTH',   mapFeatureId: 'VN-VL' },
  { code: 'tay_ninh',       name: 'Tây Ninh',          region: 'SOUTH',   mapFeatureId: 'VN-TNN' },
  { code: 'dong_nai',       name: 'Đồng Nai',          region: 'SOUTH',   mapFeatureId: 'VN-DNI' },
  { code: 'lam_dong',       name: 'Lâm Đồng',          region: 'CENTRAL', mapFeatureId: 'VN-LD' },
  { code: 'dak_lak',        name: 'Đắk Lắk',           region: 'CENTRAL', mapFeatureId: 'VN-DL' },
  { code: 'khanh_hoa',      name: 'Khánh Hòa',         region: 'CENTRAL', mapFeatureId: 'VN-KH' },
  { code: 'gia_lai',        name: 'Gia Lai',           region: 'CENTRAL', mapFeatureId: 'VN-GL' },
  { code: 'quang_ngai',     name: 'Quảng Ngãi',        region: 'CENTRAL', mapFeatureId: 'VN-QNG' },
  { code: 'tp_ho_chi_minh', name: 'TP. Hồ Chí Minh',  region: 'SOUTH',   mapFeatureId: 'VN-SG' },
  { code: 'lang_son',       name: 'Lạng Sơn',          region: 'NORTH',   mapFeatureId: 'VN-LS' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await Province.countDocuments();
  if (existing > 0) {
    console.log(`Đã có ${existing} tỉnh trong DB. Xoá và seed lại...`);
    await Province.deleteMany({});
  }

  const result = await Province.insertMany(PROVINCES);
  console.log(`✅ Đã seed ${result.length} tỉnh thành công.`);

  await mongoose.disconnect();
  console.log('Disconnected.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
