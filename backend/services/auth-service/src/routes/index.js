const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const gamificationRoutes = require('./gamification.routes');
const adminRoutes = require('./admin.routes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/gamification', gamificationRoutes);

// Admin routes — mount at root so /auth/login, /admin/*, /auth/me
// are accessible under /api/v1 without extra prefix
router.use('/', adminRoutes);

module.exports = router;
