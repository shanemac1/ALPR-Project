# 🚗 ALPR — Automatic License Plate Recognition

A full-stack web application for detecting and recognizing license plates from uploaded images. Built with the MERN stack and a Python inference backend using ONNX Runtime.

---

## Features

- **Image Upload** — Drag-and-drop or browse to upload up to 10 images at once (JPG, PNG, BMP, WebP, TIFF)
- **ALPR Inference** — Plate detection via YOLOv9-S + character recognition via CCT-S v2 (both ONNX, no cloud API)
- **Results Browser** — Paginated, searchable history of all detections stored in MongoDB
- **Dashboard** — Summary stats, top detected plates bar chart, system health, and model info

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Axios |
| Backend | Node.js, Express, Socket.IO, Multer |
| Database | MongoDB 8 (local) |
| Inference | Python 3.10+, ONNX Runtime, OpenCV, NumPy |
| Models | YOLOv9-S (detection) + CCT-S v2 (OCR), both `.onnx` |

---

## Prerequisites

- **Node.js** v18 or later
- **Python** 3.10 or later (with a virtual environment recommended)
- **MongoDB** running locally on `127.0.0.1:27017`

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/alpr-project.git
cd alpr-project
```

### 2. Download ML models

The `.onnx` model files are excluded from the repo due to size. Place them in `backend/MLmodels/`:

```
backend/MLmodels/
├── yolo-v9-s-608-license-plates-end2end.onnx
├── cct_s_v2_global.onnx
└── cct_s_v2_global_plate_config.yaml   ← already in repo
```

Models can be downloaded from Hugging Face:
- Detection: [nickmuchi/yolo-v9-s-608-license-plate-end2end](https://huggingface.co/nickmuchi/yolo-v9-s-608-license-plate-end2end)
- OCR: [nickmuchi/cct-s-v2-global-model](https://huggingface.co/nickmuchi/cct-s-v2-global-model)

### 3. Install backend (Node) dependencies

```bash
cd backend
npm install
```

### 4. Configure backend environment

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

```env
MONGO_URI=mongodb://127.0.0.1:27017/alpr_db
PORT=5000
# Point to your Python venv interpreter (Windows example):
# PYTHON_EXE=C:\Users\YourName\alpr-project\.venv\Scripts\python.exe
PYTHON_EXE=python
```

### 5. Set up Python virtual environment

```bash
# From the project root
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 6. Install frontend dependencies

```bash
cd frontend
npm install
```

---

## Running the App

Open **two terminals**:

**Terminal 1 — Backend**
```bash
cd backend
npm start
# Server starts at http://localhost:5000
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm start
# React dev server starts at http://localhost:3000
```

---

## Project Structure

```
alpr-project/
├── backend/
│   ├── routes/
│   │   ├── upload.js        # POST /api/upload
│   │   └── detections.js    # GET/DELETE /api/detections
│   ├── models/
│   │   └── Detection.js     # Mongoose schema
│   ├── MLmodels/            # ONNX model files (not in repo)
│   ├── uploads/             # Temporary image storage
│   ├── alpr_engine.py       # Core inference engine
│   ├── process_image.py     # CLI wrapper called by Node
│   ├── server.js            # Express + Socket.IO entry point
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/
│       │   └── Navbar.js
│       ├── pages/
│       │   ├── Upload.js    # Image upload + instant results
│       │   ├── Results.js   # Detection history table
│       │   └── Dashboard.js # Stats & system health
│       └── utils/
│           └── api.js       # Axios API helpers
└── README.md
```

---

## License

MIT
