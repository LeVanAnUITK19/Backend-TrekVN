require('dotenv').config();
const mongoose = require('mongoose');
const Checkin = require('../src/models/MilestoneCheckin');
const { enqueue } = require('../src/repositories/eventOutbox.repository');
const { processBatch } = require('../src/events/publishers/outbox.worker');
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = { 'verification.status': 'VERIFIED' };
  const apply = process.argv.includes('--apply');
  console.log('Verified check-ins: ' + await Checkin.countDocuments(filter));
  if (apply) for await (const row of Checkin.find(filter).cursor()) {
    const base = { userId: row.userId, journeyId: row.journeyId, checkinId: String(row._id) };
    await enqueue('CHECKIN_VERIFIED', { ...base, milestoneId: row.milestoneId, milestoneType: row.milestoneType }, 'CHECKIN_VERIFIED:' + row._id);
    await enqueue('PROVINCE_FIRST_VISITED', { ...base, provinceId: String(row.provinceId) }, 'PROVINCE_FIRST_VISITED:' + row._id);
    if (row.qualifiesPlaceVisit) await enqueue('PLACE_FIRST_VISITED', { ...base, trekkingPlaceId: row.trekkingPlaceId }, 'PLACE_FIRST_VISITED:' + row._id);
  }
  if (apply) await processBatch();
  console.log(apply ? 'Replay queued; workers continue delivery.' : 'Dry run; pass --apply to queue rewards.');
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
