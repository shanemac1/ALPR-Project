import React, { useState, useRef, useCallback } from 'react';
import { uploadImages } from '../utils/api';
import './Upload.css';

export default function Upload({ onUploadComplete }) {
  const [files, setFiles]       = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState('');
  const [results, setResults]   = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    const valid = Array.from(newFiles).filter(f =>
      /\.(jpe?g|png|bmp|webp|tiff?)$/i.test(f.name)
    );
    if (!valid.length) return;
    setFiles(prev => [...prev, ...valid].slice(0, 10));
    valid.forEach(f => {
      const reader = new FileReader();
      reader.onload = e =>
        setPreviews(prev => [...prev, { name: f.name, src: e.target.result }].slice(0, 10));
      reader.readAsDataURL(f);
    });
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const clearAll = () => {
    setFiles([]);
    setPreviews([]);
    setResults([]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!files.length) return;
    setLoading(true);
    setError('');
    setProgress(0);
    setResults([]);
    try {
      const res = await uploadImages(files, setProgress);
      setResults(res.results || []);
      setFiles([]);
      setPreviews([]);
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const totalPlates = results.reduce((acc, r) => acc + (r.plates_found || 0), 0);
  const hasResults  = results.length > 0;

  return (
    <div className="upload-page">

      {/* ── Left panel ── */}
      <div className="upload-left">
        <div className="section-heading">
          <h2>Upload Images</h2>
          <p>Detect license plates from JPG, PNG, BMP, WebP or TIFF images.</p>
        </div>

        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${files.length ? 'has-files' : ''}`}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.bmp,.webp,.tiff"
            multiple
            hidden
            onChange={e => addFiles(e.target.files)}
          />
          <div className="drop-icon">📂</div>
          <p className="drop-title">
            {files.length
              ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
              : 'Drop images here or click to browse'}
          </p>
          <p className="drop-hint">JPG · PNG · BMP · WebP · TIFF &nbsp;•&nbsp; Max 30 MB each &nbsp;•&nbsp; Up to 10 at once</p>
        </div>

        {previews.length > 0 && (
          <div className="preview-grid">
            {previews.map((p, i) => (
              <div key={i} className="preview-item">
                <img src={p.src} alt={p.name} />
                <button className="remove-btn" onClick={e => { e.stopPropagation(); removeFile(i); }}>✕</button>
                <span className="preview-name">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {loading && (
          <div className="progress-wrap">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-label">Processing… {progress}%</span>
          </div>
        )}

        <div className="upload-actions">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!files.length || loading}
          >
            {loading
              ? <><span className="btn-spinner" /> Detecting…</>
              : <>🔍 Detect Plates{files.length > 0 ? ` (${files.length})` : ''}</>
            }
          </button>
          {(files.length > 0 || hasResults) && (
            <button className="btn btn-ghost" onClick={clearAll}>Clear</button>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="upload-right">
        {!hasResults ? (
          <div className="results-empty">
            <span className="empty-icon">🖼️</span>
            <p>Results will appear here after detection</p>
          </div>
        ) : (
          <>
            <div className="results-summary">
              <div className="summary-stat">
                <span className="summary-val">{results.length}</span>
                <span className="summary-lbl">Images processed</span>
              </div>
              <div className="summary-stat">
                <span className="summary-val">{totalPlates}</span>
                <span className="summary-lbl">Plates detected</span>
              </div>
              <div className="summary-stat">
                <span className="summary-val">{results.filter(r => !r.error).length}</span>
                <span className="summary-lbl">Successful</span>
              </div>
            </div>

            <div className="result-list">
              {results.map((r, i) => (
                <ResultCard key={i} r={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({ r }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`result-card ${r.error ? 'has-error' : ''}`}>
      {/* Header */}
      <div className="result-card-header" onClick={() => setExpanded(v => !v)}>
        <span className="result-filename">{r.file}</span>
        <div className="result-card-meta">
          {r.error ? (
            <span className="badge badge-red">Error</span>
          ) : (
            <span className={`badge ${r.plates_found > 0 ? 'badge-green' : 'badge-yellow'}`}>
              {r.plates_found ?? 0} plate{r.plates_found !== 1 ? 's' : ''}
            </span>
          )}
          <button className="expand-btn">{expanded ? '▲' : '▼'}</button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="result-card-body">
          {r.error && <p className="result-error-msg">⚠️ {r.error}</p>}

          {/* ── Full annotated vehicle image ── */}
          {!r.error && r.annotated_b64 && (
            <div className="annotated-wrap">
              <img
                src={`data:image/jpeg;base64,${r.annotated_b64}`}
                alt="Annotated vehicle"
                className="annotated-img"
              />
            </div>
          )}

          {/* ── Per-plate details ── */}
          {!r.error && r.plates?.length > 0 && (
            <div className="plates-list">
              {r.plates.map((p, pi) => (
                <div key={pi} className="plate-row">
                  <div className="plate-row-top">
                    <span className="plate-number mono">{p.plate_text}</span>
                    <div className="plate-badges">
                      <span className={`badge ${p.ocr_conf > 0.8 ? 'badge-green' : p.ocr_conf > 0.5 ? 'badge-yellow' : 'badge-red'}`}>
                        OCR {(p.ocr_conf * 100).toFixed(0)}%
                      </span>
                      <span className="badge badge-blue">
                        DET {(p.detection_conf * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {p.plate_image_b64 && (
                    <img
                      src={`data:image/jpeg;base64,${p.plate_image_b64}`}
                      alt="Plate crop"
                      className="plate-crop"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!r.error && r.plates_found === 0 && (
            <p className="no-plate-msg">No license plates detected in this image.</p>
          )}

          {!r.error && (
            <div className="result-footer">
              <span className="result-timing">{r.processing_ms} ms</span>
              {r.mongo_id
                ? <span className="saved-tag">✅ Saved to DB</span>
                : <span className="unsaved-tag">Not saved</span>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}
