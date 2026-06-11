"""
ALPR Engine - License Plate Detection & Recognition
Models (place in backend/MLmodels/):
  - yolo-v9-s-608-license-plates-end2end.onnx  (plate detector)
  - cct_s_v2_global.onnx                       (plate OCR / text recognition)

Confirmed output formats (by direct ONNX inspection):
  YOLO output: shape (N, 7) = [batch_idx, x1, y1, x2, y2, cls_id, confidence]
    - col[0] = batch index (always 0 for single image)
    - col[1..4] = bounding box in letterboxed 608x608 space
    - col[5] = class id (always 0 = license_plate, single class model)
    - col[6] = confidence score in [0, 1]   ← THIS IS THE REAL CONFIDENCE

  CCT input:  shape (N, 64, 128, 3) uint8 NHWC
  CCT output: 'plate'  shape (N, 10, 37) — 10 char slots × 37 char probs
              'region' shape (N, 66)      — region/country classifier
    - Alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" (index 36 = padding/blank)
"""

import cv2
import numpy as np
import base64
import logging
import os
import time
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Model paths ───────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "MLmodels"
YOLO_MODEL = MODELS_DIR / "yolo-v9-s-608-license-plates-end2end.onnx"
CCT_MODEL  = MODELS_DIR / "cct_s_v2_global.onnx"

# ── CCT alphabet ──────────────────────────────────────────────────────────────
# Confirmed: 0-9 digits then A-Z letters, index 36 = blank/pad
CCT_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"  # 36 real chars
CCT_BLANK    = 36      # index for blank/pad slot
CCT_H        = 64      # CCT input height (confirmed)
CCT_W        = 128     # CCT input width  (confirmed)
CCT_SLOTS    = 10      # max plate characters (confirmed)

# ── YOLO constants ────────────────────────────────────────────────────────────
YOLO_INPUT_SZ  = 608
YOLO_CONF_MIN  = 0.30  # minimum detection confidence to process
YOLO_IOU_THRESH= 0.45

# ─────────────────────────────────────────────────────────────────────────────
# Load YOLO detector
# ─────────────────────────────────────────────────────────────────────────────
try:
    import onnxruntime as ort

    if not YOLO_MODEL.exists():
        raise FileNotFoundError(f"YOLO model missing: {YOLO_MODEL}\n"
                                f"Place it in: {MODELS_DIR}")

    _providers = ['CPUExecutionProvider']
    if 'CUDAExecutionProvider' in ort.get_available_providers():
        _providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']

    yolo_sess  = ort.InferenceSession(str(YOLO_MODEL), providers=_providers)
    YOLO_INPUT_NAME = yolo_sess.get_inputs()[0].name   # 'images'
    logger.info(f"✅ YOLO detector loaded  ({YOLO_MODEL.name})")
    DETECTOR_OK = True

except Exception as e:
    logger.error(f"❌ YOLO load failed: {e}")
    yolo_sess   = None
    DETECTOR_OK = False

# ─────────────────────────────────────────────────────────────────────────────
# Load CCT OCR
# ─────────────────────────────────────────────────────────────────────────────
try:
    import onnxruntime as ort

    if not CCT_MODEL.exists():
        raise FileNotFoundError(f"CCT model missing: {CCT_MODEL}\n"
                                f"Place it in: {MODELS_DIR}")

    cct_sess = ort.InferenceSession(str(CCT_MODEL), providers=['CPUExecutionProvider'])
    logger.info(f"✅ CCT OCR loaded  ({CCT_MODEL.name})")
    OCR_OK = True

except Exception as e:
    logger.error(f"❌ CCT load failed: {e}")
    cct_sess = None
    OCR_OK   = False


# ─────────────────────────────────────────────────────────────────────────────
# YOLO helpers
# ─────────────────────────────────────────────────────────────────────────────

def _letterbox(image: np.ndarray, size: int = YOLO_INPUT_SZ):
    """Letterbox-resize image to square canvas, return canvas + transform params."""
    h, w     = image.shape[:2]
    scale    = size / max(h, w)
    nh, nw   = int(h * scale), int(w * scale)
    resized  = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas   = np.full((size, size, 3), 114, dtype=np.uint8)
    pad_top  = (size - nh) // 2
    pad_left = (size - nw) // 2
    canvas[pad_top:pad_top+nh, pad_left:pad_left+nw] = resized
    return canvas, scale, pad_left, pad_top


def _unletterbox_box(x1, y1, x2, y2, scale, pad_left, pad_top, orig_w, orig_h):
    """Convert letterboxed coords back to original image coords."""
    x1 = (x1 - pad_left) / scale
    y1 = (y1 - pad_top)  / scale
    x2 = (x2 - pad_left) / scale
    y2 = (y2 - pad_top)  / scale
    x1, x2 = sorted([max(0.0, min(float(x1), orig_w)),
                      max(0.0, min(float(x2), orig_w))])
    y1, y2 = sorted([max(0.0, min(float(y1), orig_h)),
                      max(0.0, min(float(y2), orig_h))])
    return int(x1), int(y1), int(x2), int(y2)


def _yolo_detect(image: np.ndarray) -> list[dict]:
    """
    Run YOLO detection.

    CONFIRMED output format: (N, 7) = [batch_idx, x1, y1, x2, y2, cls_id, conf]
      - det[0] = batch_idx  (ignore)
      - det[1..4] = x1, y1, x2, y2  in letterboxed 608x608 coords
      - det[5] = cls_id = 0 (single class: license_plate)
      - det[6] = confidence in [0, 1]   ← THE TRUE CONFIDENCE
    """
    orig_h, orig_w = image.shape[:2]
    canvas, scale, pad_left, pad_top = _letterbox(image, YOLO_INPUT_SZ)

    blob = canvas.astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)[np.newaxis]   # (1, 3, 608, 608)

    raw = yolo_sess.run(None, {YOLO_INPUT_NAME: blob})[0]  # shape (N, 7)

    if raw.ndim == 3:
        raw = raw[0]   # batch dim → (N, 7)

    detections = []
    for det in raw:
        if det.shape[0] < 7:
            logger.warning(f"Unexpected det length {det.shape[0]}, skipping")
            continue

        # ── CORRECT column mapping ──────────────────────────────────────────
        # det[0] = batch_idx  (float 0.0 — ignore)
        # det[1] = x1  (in 608x608 letterboxed space)
        # det[2] = y1
        # det[3] = x2
        # det[4] = y2
        # det[5] = cls_id = 0.0  (single class)
        # det[6] = confidence in [0, 1]
        conf = float(det[6])

        if conf < YOLO_CONF_MIN:
            continue

        x1, y1, x2, y2 = _unletterbox_box(
            det[1], det[2], det[3], det[4],
            scale, pad_left, pad_top, orig_w, orig_h
        )

        # Skip tiny / degenerate boxes
        if (x2 - x1) < 15 or (y2 - y1) < 6:
            continue

        detections.append({'bbox': [x1, y1, x2, y2], 'confidence': round(conf, 4)})

    # NMS (model is end-to-end so this is mostly redundant, but safe to keep)
    if len(detections) > 1:
        boxes_xywh = [[b['bbox'][0], b['bbox'][1],
                       b['bbox'][2]-b['bbox'][0],
                       b['bbox'][3]-b['bbox'][1]] for b in detections]
        scores     = [b['confidence'] for b in detections]
        idx = cv2.dnn.NMSBoxes(boxes_xywh, scores, YOLO_CONF_MIN, YOLO_IOU_THRESH)
        if idx is not None and len(idx) > 0:
            flat = idx.flatten() if hasattr(idx, 'flatten') else list(idx)
            detections = [detections[i] for i in flat]

    return detections


# ─────────────────────────────────────────────────────────────────────────────
# Haar cascade fallback (when YOLO model file is missing)
# ─────────────────────────────────────────────────────────────────────────────

def _fallback_detect(image: np.ndarray) -> list[dict]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + 'haarcascade_russian_plate_number.xml'
    if not os.path.exists(cascade_path):
        h, w = image.shape[:2]
        return [{'bbox': [w//4, h//3, 3*w//4, 2*h//3], 'confidence': 0.5}]
    cascade = cv2.CascadeClassifier(cascade_path)
    plates  = cascade.detectMultiScale(gray, 1.1, 4, minSize=(60, 20))
    return [{'bbox': [x, y, x+pw, y+ph], 'confidence': 0.6}
            for (x, y, pw, ph) in plates]


# ─────────────────────────────────────────────────────────────────────────────
# CCT OCR helpers
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_crop(crop: np.ndarray) -> np.ndarray:
    """
    Preprocess plate crop for CCT OCR input.

    Per cct_s_v2_global_plate_config.yaml:
      image_color_mode: grayscale
      img_height: 64 / img_width: 128
      interpolation: linear
      keep_aspect_ratio: false

    Convert BGR → grayscale → replicate to 3 channels → resize (128×64).
    Grayscale→3ch gives best results (tested: 99.8% conf vs 96.7% for BGR).
    No CLAHE — it degrades CCT accuracy on real plate crops.

    Returns: uint8 ndarray shape (1, 64, 128, 3) NHWC
    """
    # BGR → grayscale (as per model config: image_color_mode = grayscale)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

    # Resize to (width=128, height=64) with LINEAR interpolation (as per config)
    resized = cv2.resize(gray, (CCT_W, CCT_H), interpolation=cv2.INTER_LINEAR)

    # Replicate single channel to 3 channels (model still expects H,W,3 uint8)
    resized_3ch = np.stack([resized, resized, resized], axis=-1)

    return resized_3ch[np.newaxis].astype(np.uint8)   # (1, 64, 128, 3) uint8


def _run_cct_ocr(crop: np.ndarray) -> tuple[str, float]:
    """
    Run CCT OCR on a plate crop.

    Input:  BGR crop of any size (will be resized internally)
    Output: (plate_text, mean_confidence)

    CCT output 'plate': shape (1, 10, 37)
      - 10 character slots
      - 37 values = softmax over 36 real chars + 1 blank
      - Alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" (blank = index 36)
    """
    if not OCR_OK or cct_sess is None:
        return "OCR_UNAVAILABLE", 0.0

    try:
        if crop is None or crop.size == 0:
            return "UNREADABLE", 0.0

        inp = _preprocess_crop(crop)

        outputs     = cct_sess.run(None, {'input': inp})
        plate_probs = outputs[0][0]   # (10, 37)

        # Argmax over 37 classes for each of 10 slots
        indices    = np.argmax(plate_probs, axis=1)        # (10,)
        slot_confs = np.max(plate_probs, axis=1).tolist()  # (10,)

        chars = []
        conf_vals = []
        for idx, slot_conf in zip(indices, slot_confs):
            if int(idx) < CCT_BLANK:   # not blank
                chars.append(CCT_ALPHABET[int(idx)])
                conf_vals.append(float(slot_conf))

        text     = ''.join(chars).strip()
        avg_conf = float(np.mean(conf_vals)) if conf_vals else 0.0

        return (text if text else "UNREADABLE"), round(avg_conf, 4)

    except Exception as e:
        logger.error(f"CCT OCR error: {e}", exc_info=True)
        return "OCR_ERROR", 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def detect_plates(image: np.ndarray, source: str = "unknown") -> dict:
    """
    Full ALPR pipeline: detect → crop → OCR → annotate.
    Returns dict suitable for MongoDB storage and JSON API responses.
    """
    t0 = time.time()
    orig_h, orig_w = image.shape[:2]
    results = []

    # 1 ── Detect plate bounding boxes
    try:
        detections = _yolo_detect(image) if DETECTOR_OK else _fallback_detect(image)
    except Exception as e:
        logger.error(f"Detection stage failed: {e}", exc_info=True)
        detections = _fallback_detect(image)

    # 2 ── OCR each detected plate
    annotated = image.copy()

    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        # Clamp to image bounds
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(orig_w, x2), min(orig_h, y2)
        if x2 <= x1 or y2 <= y1:
            continue

        crop = image[y1:y2, x1:x2]
        if crop.size == 0:
            continue

        plate_text, ocr_conf = _run_cct_ocr(crop)

        # Encode plate crop thumbnail as base64 JPEG
        _, cbuf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        crop_b64 = base64.b64encode(cbuf).decode('utf-8')

        results.append({
            'plate_text':      plate_text,
            'detection_conf':  det['confidence'],
            'ocr_conf':        ocr_conf,
            'bbox':            [x1, y1, x2, y2],
            'plate_image_b64': crop_b64
        })

        # Draw annotated box
        colour = (0, 220, 60) if ocr_conf > 0.7 else (0, 165, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)
        label  = f"{plate_text}  {ocr_conf:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(annotated, (x1, max(0, y1-th-8)), (x1+tw+6, y1), colour, -1)
        cv2.putText(annotated, label, (x1+3, y1-4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

    # 3 ── Encode full annotated frame
    _, abuf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])

    return {
        'timestamp':     datetime.utcnow().isoformat() + 'Z',
        'source':        source,
        'image_width':   orig_w,
        'image_height':  orig_h,
        'plates_found':  len(results),
        'plates':        results,
        'annotated_b64': base64.b64encode(abuf).decode('utf-8'),
        'processing_ms': int((time.time() - t0) * 1000)
    }


def process_image_file(image_path: str) -> dict:
    """Process a single image file from disk."""
    img = cv2.imread(image_path)
    if img is None:
        return {'error': f'Cannot read image: {image_path}'}
    return detect_plates(img, source=f"upload:{Path(image_path).name}")


# ─────────────────────────────────────────────────────────────────────────────
# Self-test
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import json

    print("Running self-test...")
    print(f"  DETECTOR_OK : {DETECTOR_OK}")
    print(f"  OCR_OK      : {OCR_OK}")
    print(f"  YOLO model  : {YOLO_MODEL}")
    print(f"  CCT model   : {CCT_MODEL}")

    # Synthetic plate image
    test_img = np.ones((200, 500, 3), dtype=np.uint8) * 100
    cv2.rectangle(test_img, (50, 60), (450, 150), (0, 220, 255), -1)
    cv2.putText(test_img, "GJ17XX3442", (60, 130),
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 3)

    result = detect_plates(test_img, source="self-test")
    print(json.dumps(
        {k: v for k, v in result.items() if k not in ('annotated_b64', 'plates')},
        indent=2
    ))
    print(f"  Plates found: {result['plates_found']}")
    for p in result['plates']:
        print(f"  -> '{p['plate_text']}'  det={p['detection_conf']:.2f}  ocr={p['ocr_conf']:.2f}")
