import React, { useState, useEffect, useCallback } from 'react';
import { getDetections, deleteDetection, clearDetections } from '../utils/api';
import './Results.css';

export default function Results({ lastUploadTs }) {
  const [rows, setRows]         = useState([]);
  const [pagination, setPag]    = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDetections({ page, limit: 20, search, source: 'upload' });
      setRows(res.data || []);
      setPag(res.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);
  // Auto-refresh when a new upload completes
  useEffect(() => { if (lastUploadTs) fetchData(); }, [lastUploadTs]); // eslint-disable-line

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await deleteDetection(id);
      setRows(prev => prev.filter(r => r._id !== id));
      setPag(prev => ({ ...prev, total: prev.total - 1 }));
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL detection records from the database?')) return;
    await clearDetections();
    setRows([]);
    setPag({ page: 1, pages: 1, total: 0 });
  };

  const bestPlate = (rec) => {
    if (!rec.plates?.length) return null;
    return rec.plates.reduce((a, b) => (b.ocr_conf > a.ocr_conf ? b : a));
  };

  return (
    <div className="results-page">
      {/* Toolbar */}
      <div className="results-toolbar">
        <div className="toolbar-left">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search plate number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
            {loading ? <span className="mini-spinner" /> : '🔄'} Refresh
          </button>
        </div>
        <div className="toolbar-right">
          <span className="total-badge">{pagination.total} records</span>
          {pagination.total > 0 && (
            <button className="btn btn-danger-sm" onClick={handleClearAll}>
              🗑️ Clear All
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        {loading && rows.length === 0 ? (
          <div className="table-empty">
            <div className="spinner" />
            <p>Loading records…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="table-empty">
            <span style={{ fontSize: 40 }}>📋</span>
            <p>No detection records yet</p>
            <span className="empty-hint">Upload images to get started</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Best Plate</th>
                  <th>OCR</th>
                  <th>Det.</th>
                  <th style={{ textAlign: 'center' }}>Count</th>
                  <th style={{ textAlign: 'center' }}>ms</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const best  = bestPlate(row);
                  const isExp = expanded === row._id;
                  return (
                    <React.Fragment key={row._id}>
                      <tr className={isExp ? 'row-expanded' : ''}>
                        <td className="mono td-time">
                          {new Date(row.timestamp).toLocaleString()}
                        </td>
                        <td>
                          {best
                            ? <span className="plate-chip mono">{best.plate_text}</span>
                            : <span className="text-muted">—</span>
                          }
                        </td>
                        <td>
                          {best
                            ? <span className={`badge ${best.ocr_conf > .8 ? 'badge-green' : best.ocr_conf > .5 ? 'badge-yellow' : 'badge-red'}`}>
                                {(best.ocr_conf * 100).toFixed(0)}%
                              </span>
                            : '—'
                          }
                        </td>
                        <td>
                          {best
                            ? <span className="badge badge-blue">{(best.detection_conf * 100).toFixed(0)}%</span>
                            : '—'
                          }
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.plates_found}</td>
                        <td style={{ textAlign: 'center' }}>{row.processing_ms ?? '—'}</td>
                        <td>
                          <div className="action-cell">
                            <button
                              className="tbl-btn"
                              onClick={() => setExpanded(isExp ? null : row._id)}
                              title={isExp ? 'Collapse' : 'Expand'}
                            >
                              {isExp ? '▲' : '▼'}
                            </button>
                            <button
                              className="tbl-btn danger"
                              onClick={() => handleDelete(row._id)}
                              disabled={deleting === row._id}
                              title="Delete"
                            >
                              {deleting === row._id ? '…' : '🗑'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExp && (
                        <tr className="detail-row">
                          <td colSpan={7}>
                            <div className="detail-box">
                              <div className="detail-meta">
                                <div><strong>ID:</strong> <code>{row._id}</code></div>
                                <div><strong>Source:</strong> {row.source}</div>
                                <div><strong>Resolution:</strong> {row.image_width}×{row.image_height}px</div>
                              </div>
                              <div className="detail-plates">
                                {row.plates?.map((p, i) => (
                                  <div key={i} className="detail-plate">
                                    <span className="plate-text-lg mono">{p.plate_text}</span>
                                    <div className="detail-plate-badges">
                                      <span className={`badge ${p.ocr_conf > .8 ? 'badge-green' : p.ocr_conf > .5 ? 'badge-yellow' : 'badge-red'}`}>
                                        OCR {(p.ocr_conf * 100).toFixed(1)}%
                                      </span>
                                      <span className="badge badge-blue">
                                        DET {(p.detection_conf * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                    {p.bbox && (
                                      <div className="bbox-info">BBox: [{p.bbox.join(', ')}]</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
          <span className="page-info">Page {page} / {pagination.pages}</span>
          <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === pagination.pages}>›</button>
          <button className="btn btn-secondary" onClick={() => setPage(pagination.pages)} disabled={page === pagination.pages}>»</button>
        </div>
      )}
    </div>
  );
}
