const { Router } = require('express');
const checkinRoutes = require('./checkin.routes');
const visitRoutes = require('./visit.routes');
const journeyRoutes = require('./journey.routes');

const router = Router();

router.use('/checkins', checkinRoutes);
router.use('/visits', visitRoutes);
// NOTE: /api/v1/journeys/* đã bị gateway route tới trekking-service.
// /checkins/journeys/:journeyId là public endpoint chuẩn qua Gateway cho journey checkin list.
// /journeys/* vẫn giữ lại cho direct service call / backward compat.
router.use('/journeys', journeyRoutes);

module.exports = router;
