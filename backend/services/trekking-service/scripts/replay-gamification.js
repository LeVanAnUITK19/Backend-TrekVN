// Reconstruct missing reward events from persisted domain records. Source IDs prevent duplicate XP.
require('dotenv').config();
const mongoose = require('mongoose');
const { enqueue } = require('../src/repositories/eventOutbox.repository');
const { processBatch } = require('../src/events/publishers/outbox.worker');
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const apply = process.argv.includes('--apply');
  const sources = [
    ['Journey', { status: 'COMPLETED' }, 'TREKKING_JOURNEY_COMPLETED', (row) => ({ userId: row.userId, journeyId: String(row._id),
      distanceMeters: row.statistics?.distanceMeters || 0, elevationGain: row.statistics?.elevationGain || 0 })],
    ['UserBadge', {}, 'TREKKING_BADGE_EARNED', async (row) => {
      const badge = await require('../src/models/Badge').findById(row.badgeId);
      if (!badge) throw new Error('Badge definition missing: ' + row.badgeId);
      return { userId: row.userId, badgeId: String(row.badgeId), rarity: badge.rarity };
    }],
    ['RouteSubmission', { status: 'APPROVED' }, 'TREKKING_CONTRIBUTION_APPROVED', (row) => ({ userId: row.userId, contributionId: String(row._id), type: 'ROUTE_SUBMISSION' })],
    ['PlaceSuggestion', { status: 'APPROVED' }, 'TREKKING_CONTRIBUTION_APPROVED', (row) => ({ userId: row.userId, contributionId: String(row._id), type: 'PLACE_SUGGESTION' })],
  ];
  for (const [name, filter, type, payload] of sources) {
    const Model = require('../src/models/' + name);
    console.log(name + ': ' + await Model.countDocuments(filter));
    if (apply) for await (const row of Model.find(filter).cursor()) {
      await enqueue(type, await payload(row), 'replay:' + type + ':' + row._id);
    }
  }
  if (apply) await processBatch();
  console.log(apply ? 'Replay queued; workers continue delivery.' : 'Dry run; pass --apply to queue rewards.');
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
