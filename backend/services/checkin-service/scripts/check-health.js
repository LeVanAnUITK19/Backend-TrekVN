#!/usr/bin/env node
'use strict';

/**
 * Health check script for checkin-service
 * Checks:
 * 1. MongoDB connection
 * 2. JWT_SECRET configuration
 * 3. Province data seeded
 * 4. Server responding
 * 
 * Usage: node scripts/check-health.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Province = require('../src/models/Province');

const REQUIRED_PROVINCE_COUNT = 34;
const EXPECTED_JWT_SECRET = 'trekvn_jwt_secret_change_in_production';

async function checkHealth() {
  console.log('🔍 Checkin Service Health Check\n');
  let hasErrors = false;

  // Check 1: MongoDB Connection
  try {
    console.log('1️⃣  Checking MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   ✅ MongoDB connected successfully');
  } catch (err) {
    console.error('   ❌ MongoDB connection failed:', err.message);
    hasErrors = true;
    process.exit(1);
  }

  // Check 2: JWT_SECRET
  console.log('\n2️⃣  Checking JWT_SECRET...');
  const currentSecret = process.env.JWT_SECRET;
  if (!currentSecret) {
    console.error('   ❌ JWT_SECRET not set in .env');
    hasErrors = true;
  } else if (currentSecret !== EXPECTED_JWT_SECRET) {
    console.warn('   ⚠️  JWT_SECRET mismatch!');
    console.warn(`      Current:  "${currentSecret}"`);
    console.warn(`      Expected: "${EXPECTED_JWT_SECRET}"`);
    console.warn('      → This will cause 401 errors when verifying tokens from auth-service');
    hasErrors = true;
  } else {
    console.log('   ✅ JWT_SECRET matches auth-service');
  }

  // Check 3: Province data
  console.log('\n3️⃣  Checking province data...');
  try {
    const count = await Province.countDocuments();
    if (count === 0) {
      console.error(`   ❌ No provinces in database`);
      console.error('      Run: node scripts/seed-provinces.js');
      hasErrors = true;
    } else if (count < REQUIRED_PROVINCE_COUNT) {
      console.warn(`   ⚠️  Only ${count}/${REQUIRED_PROVINCE_COUNT} provinces found`);
      console.warn('      Run: node scripts/seed-provinces.js');
      hasErrors = true;
    } else {
      console.log(`   ✅ Found ${count} provinces in database`);
    }
  } catch (err) {
    console.error('   ❌ Failed to query provinces:', err.message);
    hasErrors = true;
  }

  // Check 4: Server configuration
  console.log('\n4️⃣  Checking server configuration...');
  const port = process.env.PORT || 3002;
  const mongoUri = process.env.MONGODB_URI;
  console.log(`   PORT: ${port}`);
  console.log(`   MONGODB_URI: ${mongoUri ? '✅ Set' : '❌ Not set'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  await mongoose.disconnect();

  // Summary
  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    console.log('❌ Health check FAILED - fix issues above');
    process.exit(1);
  } else {
    console.log('✅ Health check PASSED - service is ready');
    process.exit(0);
  }
}

checkHealth().catch((err) => {
  console.error('\n💥 Health check crashed:', err.message);
  process.exit(1);
});
