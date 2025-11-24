// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../Controller/dashboardController');

// Summary: counts + latest items
// GET /api/dashboard
router.get('/', ctrl.summary);

// Counts only
// GET /api/dashboard/counts
router.get('/counts', ctrl.counts);

// Latest only (use query params ?type=events|blogs|galleries&limit=5)
// GET /api/dashboard/latest
router.get('/latest', ctrl.latest);

module.exports = router;
