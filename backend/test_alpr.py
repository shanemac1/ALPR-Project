"""
test_alpr.py  —  Diagnostic test for the ALPR system
Run from the backend/ directory: python test_alpr.py
"""
import sys, time, json
import numpy as np
import cv2

print("=" * 60)
print("  ALPR Diagnostic Test")
print("=" * 60)

# 1. Python
print(f"\n[1] Python: {sys.version}")
print(f"    {'✅ 3.11' if sys.version_info[:2]==(3,11) else '⚠️  Expected 3.11 (other versions may work)'}")

# 2. NumPy
try:
    import numpy as np
    print(f"\n[2] NumPy: {np.__version__} ✅")
except Exception as e:
    print(f"\n[2] NumPy MISSING: {e}")

# 3. OpenCV
try:
    import cv2
    print(f"\n[3] OpenCV: {cv2.__version__} ✅")
except Exception as e:
    print(f"\n[3] OpenCV MISSING: {e}")

# 4. ONNX Runtime
try:
    import onnxruntime as ort
    print(f"\n[4] ONNX Runtime: {ort.__version__} ✅")
    print(f"    Providers: {ort.get_available_providers()}")
except Exception as e:
    print(f"\n[4] onnxruntime MISSING: {e}")
    print("    Run: pip install onnxruntime>=1.18.0")

# 5. Model files
from pathlib import Path
MODELS = Path("MLmodels")
yolo_path = MODELS / "yolo-v9-s-608-license-plates-end2end.onnx"
cct_path  = MODELS / "cct_s_v2_global.onnx"
print(f"\n[5] Model files in {MODELS}/")
print(f"    YOLO: {'✅ found' if yolo_path.exists() else '❌ MISSING — copy .onnx file here'} ({yolo_path})")
print(f"    CCT:  {'✅ found' if cct_path.exists() else '❌ MISSING — copy .onnx file here'} ({cct_path})")

# 6. YOLO inference + output format check
if yolo_path.exists():
    print(f"\n[6] Testing YOLO model...")
    try:
        sess = ort.InferenceSession(str(yolo_path), providers=["CPUExecutionProvider"])
        inp  = sess.get_inputs()[0]
        print(f"    Input : {inp.name}  shape={inp.shape}  dtype={inp.type}")
        out  = sess.get_outputs()[0]
        print(f"    Output: {out.name}  shape={out.shape}")
        print(f"    Expected output format: (N, 7) = [batch_idx, x1, y1, x2, y2, cls_id, conf]")

        # Synthetic plate image
        img = np.ones((480, 640, 3), dtype=np.uint8) * 90
        cv2.rectangle(img, (150, 290), (490, 380), (0, 200, 255), -1)
        cv2.putText(img, "GJ17XX3442", (160, 360), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,0,0), 3)
        h, w = img.shape[:2]
        scale = 608 / max(h,w); nh,nw = int(h*scale),int(w*scale)
        canvas = np.full((608,608,3),114,dtype=np.uint8)
        pt,pl = (608-nh)//2,(608-nw)//2
        canvas[pt:pt+nh,pl:pl+nw] = cv2.resize(img,(nw,nh))
        blob = canvas.astype(np.float32)/255.0
        blob = blob.transpose(2,0,1)[np.newaxis]
        t0 = time.time()
        dets = sess.run(None, {inp.name: blob})[0]
        ms = (time.time()-t0)*1000
        print(f"    Inference: {ms:.0f}ms   raw detections: {dets.shape}")
        if dets.shape[0] > 0:
            best = dets[np.argmax(dets[:,6])]
            print(f"    Best det: batch={best[0]:.0f} box=[{best[1]:.0f},{best[2]:.0f},{best[3]:.0f},{best[4]:.0f}] cls={best[5]:.0f} conf={best[6]:.3f} ✅")
        else:
            print("    No detections on synthetic image (normal if model needs real photos)")
        print("    ✅ YOLO OK")
    except Exception as e:
        print(f"    ❌ YOLO test failed: {e}")
else:
    print(f"\n[6] YOLO test SKIPPED (model file missing)")

# 7. CCT OCR inference + decode check
if cct_path.exists():
    print(f"\n[7] Testing CCT OCR model...")
    try:
        sess = ort.InferenceSession(str(cct_path), providers=["CPUExecutionProvider"])
        inp  = sess.get_inputs()[0]
        print(f"    Input : {inp.name}  shape={inp.shape}  dtype={inp.type}")
        for o in sess.get_outputs():
            print(f"    Output: {o.name}  shape={o.shape}")

        # Synthetic plate crop
        crop = np.ones((64,128,3), dtype=np.uint8)*240
        cv2.putText(crop, "GJ06HS8342", (2,50), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,0,0), 2)
        batch = crop[np.newaxis].astype(np.uint8)
        t0 = time.time()
        plate_out, region_out = sess.run(None, {inp.name: batch})
        ms = (time.time()-t0)*1000

        CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        indices = np.argmax(plate_out[0], axis=1)
        text = ''.join(CHARS[i] for i in indices if i < 36)
        conf = float(np.mean(np.max(plate_out[0], axis=1)))
        print(f"    Inference: {ms:.0f}ms")
        print(f"    Decoded: '{text}'  avg_conf={conf:.3f}")
        print(f"    Region output shape: {region_out.shape}")
        print(f"    ✅ CCT OCR OK")
    except Exception as e:
        print(f"    ❌ CCT test failed: {e}")
else:
    print(f"\n[7] CCT test SKIPPED (model file missing)")

# 8. Full pipeline
if yolo_path.exists() and cct_path.exists():
    print(f"\n[8] Full pipeline test...")
    try:
        from alpr_engine import detect_plates
        img = np.ones((480, 640, 3), dtype=np.uint8) * 90
        cv2.rectangle(img, (150, 290), (490, 380), (0, 200, 255), -1)
        cv2.putText(img, "GJ17XX3442", (160, 360), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,0,0), 3)
        result = detect_plates(img, source="diagnostic")
        print(f"    plates_found: {result['plates_found']}")
        print(f"    processing_ms: {result['processing_ms']}")
        for p in result['plates']:
            print(f"    -> '{p['plate_text']}'  det={p['detection_conf']:.2f}  ocr={p['ocr_conf']:.2f}")
        print(f"    ✅ Full pipeline OK")
    except Exception as e:
        print(f"    ❌ Pipeline error: {e}")
else:
    print(f"\n[8] Full pipeline SKIPPED (model files missing)")

# 9. MongoDB
print(f"\n[9] MongoDB...")
try:
    from pymongo import MongoClient
    c = MongoClient('mongodb://127.0.0.1:27017', serverSelectionTimeoutMS=3000)
    info = c.server_info()
    print(f"    ✅ MongoDB {info.get('version','?')} connected")
    c.close()
except Exception as e:
    print(f"    ⚠️  MongoDB not reachable: {e}")
    print("    (Start mongod or update MONGO_URI in backend/.env)")

print(f"\n{'='*60}\n  Done.\n{'='*60}\n")
