#!/usr/bin/env node

/**
 * Script để verify Google Sign-In configuration
 * 
 * Chạy: node scripts/verify_google_config.js
 */

require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_ID_WEB = process.env.GOOGLE_CLIENT_ID_WEB;

console.log('\n🔍 Verifying Google Sign-In Configuration...\n');

// Check 1: Environment variables
console.log('📋 Step 1: Checking environment variables');
console.log('─────────────────────────────────────────');

if (!GOOGLE_CLIENT_ID) {
  console.error('❌ GOOGLE_CLIENT_ID not found in .env');
  console.log('   Please add: GOOGLE_CLIENT_ID=your_android_client_id.apps.googleusercontent.com');
  process.exit(1);
} else {
  console.log('✅ GOOGLE_CLIENT_ID found');
  console.log(`   Value: ${GOOGLE_CLIENT_ID.substring(0, 20)}...`);
}

if (!GOOGLE_CLIENT_ID_WEB) {
  console.warn('⚠️  GOOGLE_CLIENT_ID_WEB not found (optional for web admin)');
} else {
  console.log('✅ GOOGLE_CLIENT_ID_WEB found');
  console.log(`   Value: ${GOOGLE_CLIENT_ID_WEB.substring(0, 20)}...`);
}

// Check 2: Client ID format
console.log('\n📋 Step 2: Validating Client ID format');
console.log('─────────────────────────────────────────');

const clientIdRegex = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

if (!clientIdRegex.test(GOOGLE_CLIENT_ID)) {
  console.error('❌ GOOGLE_CLIENT_ID has invalid format');
  console.log('   Expected format: 123456789-abc123def456.apps.googleusercontent.com');
  process.exit(1);
} else {
  console.log('✅ GOOGLE_CLIENT_ID format is valid');
}

if (GOOGLE_CLIENT_ID_WEB && !clientIdRegex.test(GOOGLE_CLIENT_ID_WEB)) {
  console.warn('⚠️  GOOGLE_CLIENT_ID_WEB has invalid format');
} else if (GOOGLE_CLIENT_ID_WEB) {
  console.log('✅ GOOGLE_CLIENT_ID_WEB format is valid');
}

// Check 3: OAuth2Client initialization
console.log('\n📋 Step 3: Testing OAuth2Client initialization');
console.log('─────────────────────────────────────────');

try {
  const client = new OAuth2Client(GOOGLE_CLIENT_ID);
  console.log('✅ OAuth2Client created successfully');
  console.log(`   Client ID: ${GOOGLE_CLIENT_ID.substring(0, 20)}...`);
} catch (error) {
  console.error('❌ Failed to create OAuth2Client');
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}

// Check 4: Other required env vars
console.log('\n📋 Step 4: Checking other required environment variables');
console.log('─────────────────────────────────────────');

const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_DAYS',
];

let allEnvVarsPresent = true;

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`❌ ${varName} not found in .env`);
    allEnvVarsPresent = false;
  } else {
    console.log(`✅ ${varName} found`);
  }
});

if (!allEnvVarsPresent) {
  console.error('\n❌ Some required environment variables are missing');
  process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('✅ All configuration checks passed!');
console.log('='.repeat(50));

console.log('\n📌 Next steps:');
console.log('   1. Start the backend: npm run dev');
console.log('   2. Test with POST /api/v1/auth/google');
console.log('   3. Configure Android SHA-1 in Google Cloud Console');
console.log('   4. Test with Flutter app\n');

console.log('📖 Documentation:');
console.log('   - API: docs/auth-service-api.md');
console.log('   - Testing: TEST_GOOGLE_SIGNIN.md');
console.log('   - Frontend Setup: ../../Frontend-TrekVN/GOOGLE_SIGNIN_SETUP.md\n');
