#!/usr/bin/env node

/**
 * check-consumer-status.js
 * 
 * Script kiểm tra nhanh trạng thái Gamification Consumer
 * Chạy: node scripts/check-consumer-status.js
 */

require('dotenv').config();

const checks = {
  rabbitmq_enabled: {
    name: 'RabbitMQ Enabled',
    check: () => process.env.RABBITMQ_ENABLED === 'true',
    fix: 'Set RABBITMQ_ENABLED=true in .env file'
  },
  rabbitmq_url: {
    name: 'RabbitMQ URL',
    check: () => !!process.env.RABBITMQ_URL,
    fix: 'Set RABBITMQ_URL in .env file (e.g., amqp://localhost:5672)'
  },
  rabbitmq_exchange: {
    name: 'RabbitMQ Exchange',
    check: () => !!process.env.RABBITMQ_EXCHANGE,
    fix: 'Set RABBITMQ_EXCHANGE in .env file (e.g., trekvn.events)'
  },
  mongodb_uri: {
    name: 'MongoDB URI',
    check: () => !!process.env.MONGODB_URI,
    fix: 'Set MONGODB_URI in .env file'
  }
};

console.log('\n🔍 Gamification Consumer Status Check\n');
console.log('=' .repeat(60));

let allPassed = true;

for (const [key, { name, check, fix }] of Object.entries(checks)) {
  const passed = check();
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const value = passed ? process.env[key.toUpperCase()] || 'true' : 'NOT SET';
  
  console.log(`\n${status} ${name}`);
  console.log(`   Value: ${value}`);
  
  if (!passed) {
    console.log(`   Fix: ${fix}`);
    allPassed = false;
  }
}

console.log('\n' + '=' .repeat(60));

if (allPassed) {
  console.log('\n✅ All checks passed! Consumer should start successfully.\n');
  console.log('Next steps:');
  console.log('1. Make sure RabbitMQ service is running');
  console.log('2. Start/restart auth-service: npm run dev');
  console.log('3. Check logs for: "[GamificationConsumer] Consuming queue: auth.gamification.events"');
} else {
  console.log('\n❌ Some checks failed. Fix the issues above and try again.\n');
  process.exit(1);
}

console.log('\n📊 Current Configuration:\n');
console.log({
  RABBITMQ_ENABLED: process.env.RABBITMQ_ENABLED,
  RABBITMQ_URL: process.env.RABBITMQ_URL,
  RABBITMQ_EXCHANGE: process.env.RABBITMQ_EXCHANGE,
  MONGODB_URI: process.env.MONGODB_URI ? '[SET]' : '[NOT SET]',
  NODE_ENV: process.env.NODE_ENV || 'development'
});

console.log('\n');
