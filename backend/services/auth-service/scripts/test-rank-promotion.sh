#!/bin/bash

# test-rank-promotion.sh
# Script test toàn bộ flow thăng hạng
# 
# Usage: ./scripts/test-rank-promotion.sh <user_id> <journey_id>

set -e

USER_ID="${1}"
JOURNEY_ID="${2}"
AUTH_URL="${AUTH_SERVICE_URL:-http://localhost:3001}"
TREKKING_URL="${TREKKING_SERVICE_URL:-http://localhost:3003}"

if [ -z "$USER_ID" ] || [ -z "$JOURNEY_ID" ]; then
    echo "❌ Missing arguments"
    echo "Usage: $0 <user_id> <journey_id>"
    echo ""
    echo "Example:"
    echo "  $0 507f1f77bcf86cd799439011 507f191e810c19729de860ea"
    exit 1
fi

echo ""
echo "🧪 Testing Rank Promotion Flow"
echo "================================"
echo "User ID: $USER_ID"
echo "Journey ID: $JOURNEY_ID"
echo ""

# Step 1: Get current rank
echo "📊 Step 1: Get current rank profile..."
BEFORE=$(curl -s "${AUTH_URL}/api/v1/gamification/users/${USER_ID}" | jq -r '.data')
BEFORE_XP=$(echo $BEFORE | jq -r '.totalXp')
BEFORE_RANK=$(echo $BEFORE | jq -r '.rank.name')
BEFORE_LEVEL=$(echo $BEFORE | jq -r '.rank.level')

echo "   Current Rank: $BEFORE_RANK (Level $BEFORE_LEVEL)"
echo "   Current XP: $BEFORE_XP"
echo ""

# Step 2: Complete journey (requires auth token)
echo "⏳ Step 2: Complete journey..."
echo "   (Skipped - requires auth token, complete manually via app/Postman)"
echo ""

# Step 3: Wait for event processing
echo "⏱️  Step 3: Waiting for event processing (5 seconds)..."
sleep 5
echo ""

# Step 4: Get new rank
echo "📊 Step 4: Get new rank profile..."
AFTER=$(curl -s "${AUTH_URL}/api/v1/gamification/users/${USER_ID}" | jq -r '.data')
AFTER_XP=$(echo $AFTER | jq -r '.totalXp')
AFTER_RANK=$(echo $AFTER | jq -r '.rank.name')
AFTER_LEVEL=$(echo $AFTER | jq -r '.rank.level')

echo "   New Rank: $AFTER_RANK (Level $AFTER_LEVEL)"
echo "   New XP: $AFTER_XP"
echo ""

# Step 5: Compare results
XP_EARNED=$((AFTER_XP - BEFORE_XP))

echo "================================"
echo "📈 Results:"
echo ""
if [ $XP_EARNED -gt 0 ]; then
    echo "   ✅ XP Earned: +$XP_EARNED"
else
    echo "   ❌ No XP earned (consumer may not be running)"
fi

if [ $AFTER_LEVEL -gt $BEFORE_LEVEL ]; then
    echo "   🎉 PROMOTED: $BEFORE_RANK → $AFTER_RANK"
elif [ $XP_EARNED -gt 0 ]; then
    echo "   ℹ️  No promotion (not enough requirements yet)"
else
    echo "   ❌ No change detected"
fi

echo ""
echo "🔍 Troubleshooting:"
echo "   1. Check auth-service logs for: [GamificationConsumer]"
echo "   2. Check RabbitMQ queue: auth.gamification.events"
echo "   3. Check MongoDB: db.xpTransactions.find({userId: ObjectId('$USER_ID')})"
echo ""
