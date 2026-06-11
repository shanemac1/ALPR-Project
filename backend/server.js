/**
 * ALPR Backend – Express + MongoDB
 * Node.js (v18+) / Windows compatible
 */

require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');

// ── Routes ───────────────────────────────────────────────────────────────────
const detectionRoutes = require('./routes/detections');
const uploadRoutes    = require('./routes/upload');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/alpr_db';

mongoose.connect(MONGO_URI)
  .then(() => console.log('[MongoDB] Connected:', MONGO_URI))
  .catch(err => console.error('[MongoDB] Connection error:', err.message));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/detections', detectionRoutes);
app.use('/api/upload',     uploadRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo:  mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    ts:     new Date().toISOString()
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
});
