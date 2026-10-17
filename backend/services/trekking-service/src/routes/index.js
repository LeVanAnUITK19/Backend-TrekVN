'use strict';

const { Router } = require('express');

const placeRoutes = require('./place.routes');
const routeRoutes = require('./route.routes');
const journeyRoutes = require('./journey.routes');
const contributionRoutes = require('./contribution.routes');
const badgeRoutes = require('./badge.routes');
const uploadRoutes = require('./upload.routes');
const adminTrekkingRoutes = require('./admin.trekking.routes');
const adminContributionRoutes = require('./admin.contribution.routes');
const adminBadgeRoutes = require('./admin.badge.routes');

const router = Router();

// ─── Public/User routes ───────────────────────────────────────────────────────
router.use('/places', placeRoutes);
router.use('/routes', routeRoutes);
router.use('/journeys', journeyRoutes);
router.use('/contributions', contributionRoutes);
router.use('/badges', badgeRoutes);
router.use('/uploads', uploadRoutes);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.use('/admin/trekking', adminTrekkingRoutes);
router.use('/admin/badges', adminBadgeRoutes);
router.use('/admin', adminContributionRoutes);

module.exports = router;
