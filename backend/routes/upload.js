const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { spawn } = require('child_process');
const Detection = require('../models/Detection');

// ── multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts  = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload_${ts}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`Unsupported file type: ${ext}`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 }  // 30 MB
});

// ── helpers ───────────────────────────────────────────────────────────────────
function runPythonAlpr(imagePath) {
  return new Promise((resolve, reject) => {
    const pythonExe = process.env.PYTHON_EXE || 'python';
    const script    = path.join(__dirname, '..', 'process_image.py');
    const mongoUri  = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';

    const proc = spawn(pythonExe, [
      script,
      '--image',  imagePath,
      '--mongo',  mongoUri,
      '--db',     'alpr_db',
      '--source', 'upload'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('exit', (code) => {
      if (code !== 0) {
        console.error('[ALPR] Python stderr:', stderr.slice(-500));
        return reject(new Error(`Python process exited with code ${code}`));
      }
      try {
        const lines   = stdout.trim().split('\n').filter(l => l.trim());
        const jsonStr = lines[lines.length - 1];
        resolve(JSON.parse(jsonStr));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}\nRaw: ${stdout.slice(-300)}`));
      }
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('ALPR timeout after 120s'));
    }, 120000);
  });
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post('/', upload.array('images', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images uploaded' });
  }

  const results = [];

  for (const file of req.files) {
    try {
      const alprResult = await runPythonAlpr(file.path);

      if (alprResult.error) {
        results.push({ file: file.originalname, error: alprResult.error });
        continue;
      }

      // Fallback MongoDB insert if Python script didn't save it
      if (!alprResult.mongo_id && alprResult.plates_found > 0) {
        const doc = new Detection({
          timestamp:    alprResult.timestamp,
          source:       alprResult.source,
          image_width:  alprResult.image_width,
          image_height: alprResult.image_height,
          plates_found: alprResult.plates_found,
          plates:       (alprResult.plates || []).map(p => ({
            plate_text:     p.plate_text,
            detection_conf: p.detection_conf,
            ocr_conf:       p.ocr_conf,
            bbox:           p.bbox
          })),
          processing_ms: alprResult.processing_ms
        });
        const saved = await doc.save();
        alprResult.mongo_id = saved._id.toString();
      }

      results.push({
        file:          file.originalname,
        mongo_id:      alprResult.mongo_id,
        plates_found:  alprResult.plates_found,
        plates:        alprResult.plates,
        annotated_b64: alprResult.annotated_b64,
        processing_ms: alprResult.processing_ms
      });

    } catch (err) {
      console.error(`[Upload] Error processing ${file.originalname}:`, err.message);
      results.push({ file: file.originalname, error: err.message });
    }
  }

  res.json({ results });
});

module.exports = router;
