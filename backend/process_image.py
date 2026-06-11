"""
process_image.py
Called by the Node.js backend to process a single uploaded image.

Usage:
  python process_image.py --image <path> --mongo <uri> --db <name> [--source <label>]

Prints ONE JSON object to stdout.
"""

import sys
import json
import argparse
import logging
from pathlib import Path

logging.basicConfig(stream=sys.stderr, level=logging.WARNING)
logger = logging.getLogger(__name__)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--image',  required=True)
    ap.add_argument('--mongo',  default='mongodb://127.0.0.1:27017')
    ap.add_argument('--db',     default='alpr_db')
    ap.add_argument('--source', default='upload')
    args = ap.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(json.dumps({'error': f'File not found: {image_path}'}), flush=True)
        sys.exit(1)

    try:
        from alpr_engine import process_image_file
    except ImportError as e:
        print(json.dumps({'error': f'Cannot import alpr_engine: {e}'}), flush=True)
        sys.exit(1)

    result = process_image_file(str(image_path))
    result['source'] = f"{args.source}:{image_path.name}"

    # ── MongoDB persistence ──────────────────────────────────────────────────
    try:
        from pymongo import MongoClient
        client = MongoClient(args.mongo, serverSelectionTimeoutMS=3000)
        client.server_info()
        col = client[args.db]['detections']

        doc = {k: v for k, v in result.items() if k != 'annotated_b64'}
        for p in doc.get('plates', []):
            p.pop('plate_image_b64', None)

        ins = col.insert_one(doc)
        result['mongo_id'] = str(ins.inserted_id)
        logger.info(f"Stored to MongoDB: {ins.inserted_id}")
    except Exception as e:
        logger.warning(f"MongoDB store failed: {e}")
        result['mongo_id'] = None

    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
