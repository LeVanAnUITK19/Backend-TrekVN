const { Router } = require('express');
const checkinRoutes = require('./checkin.routes');
const visitRoutes = require('./visit.routes');
const journeyRoutes = require('./journey.routes');

const router = Router();

router.use('/checkins', checkinRoutes);
router.use('/visits', visitRoutes);
router.use('/journeys', journeyRoutes);

module.exports = router;
