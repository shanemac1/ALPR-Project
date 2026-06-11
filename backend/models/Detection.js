const mongoose = require('mongoose');

const PlateSchema = new mongoose.Schema({
  plate_text:      { type: String, required: true, index: true },
  detection_conf:  { type: Number, default: 0 },
  ocr_conf:        { type: Number, default: 0 },
  bbox:            [Number],
  plate_image_b64: { type: String, select: false }   // exclude by default
}, { _id: false });

const DetectionSchema = new mongoose.Schema({
  timestamp:      { type: Date,   default: Date.now, index: true },
  source:         { type: String, default: 'unknown', index: true },
  image_width:    Number,
  image_height:   Number,
  plates_found:   { type: Number, default: 0 },
  plates:         [PlateSchema],
  processing_ms:  Number,
  frame_index:    Number
}, { timestamps: true });

// Text index for searching plate numbers
DetectionSchema.index({ 'plates.plate_text': 'text' });

module.exports = mongoose.model('Detection', DetectionSchema);
