const express   = require('express');
const router    = express.Router();
const Detection = require('../models/Detection');

// GET /api/detections  — paginated list
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(100, parseInt(req.query.limit || '50'));
    const search = req.query.search;  // plate text search

    const filter = { source: /upload/i };  // only image uploads
    if (search) filter['plates.plate_text'] = new RegExp(search.trim(), 'i');

    const [docs, total] = await Promise.all([
      Detection.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Detection.countDocuments(filter)
    ]);

    res.json({
      data:       docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/detections/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await Detection.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/detections/:id
router.delete('/:id', async (req, res) => {
  try {
    await Detection.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/detections — clear all
router.delete('/', async (req, res) => {
  try {
    const result = await Detection.deleteMany({});
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/detections/stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, upload, recent] = await Promise.all([
      Detection.countDocuments(),
      Detection.countDocuments({ source: /upload/i }),
      Detection.countDocuments({ timestamp: { $gte: new Date(Date.now() - 86400000) } })
    ]);

    const topPlates = await Detection.aggregate([
      { $unwind: '$plates' },
      { $group: { _id: '$plates.plate_text', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({ total, upload, last24h: recent, topPlates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
