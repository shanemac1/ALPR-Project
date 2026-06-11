import React, { useState, useEffect } from 'react';
import { getStats, getHealth } from '../utils/api';
import './Dashboard.css';

export default function Dashboard() {
  const [stats, setStats]     = useState(null);
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([getStats(), getHealth()]);
      setStats(s);
      setHealth(h);
      setLastFetch(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const statCards = stats ? [
    { label: 'Total Detections', value: stats.total,   icon: '🔍', color: 'blue'   },
    { label: 'Images Uploaded',  value: stats.upload,  icon: '📤', color: 'purple' },
    { label: 'Last 24 Hours',    value: stats.last24h, icon: '🕐', color: 'yellow' },
    { label: 'Top Plate Seen',   value: stats.topPlates?.[0]?.count ?? 0, icon: '🏆', color: 'green' },
  ] : [];

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h2>Dashboard</h2>
          {lastFetch && (
            <span className="last-fetch">
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
          {loading ? <span className="mini-spinner" /> : '🔄'} Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        {loading
          ? Array(4).fill(0).map((_, i) => (
              <div key={i} className="stat-card skeleton" />
            ))
          : statCards.map(s => (
              <div key={s.label} className={`stat-card color-${s.color}`}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{(s.value ?? 0).toLocaleString()}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))
        }
      </div>

      <div className="dash-grid">
        {/* Top Plates */}
        <div className="card">
          <div className="section-title">🏆 Most Detected Plates</div>
          {loading ? (
            <div className="loading-state">Loading…</div>
          ) : !stats?.topPlates?.length ? (
            <div className="empty-state">No detections yet — upload images to start</div>
          ) : (
            <div className="top-plates">
              {stats.topPlates.map((p, i) => (
                <div key={i} className="top-plate-row">
                  <span className="rank">#{i + 1}</span>
                  <span className="plate-chip mono">{p._id}</span>
                  <div className="bar-wrap">
                    <div
                      className="bar"
                      style={{ width: `${Math.min(100, (p.count / (stats.topPlates[0]?.count || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="count">{p.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health */}
        <div className="card">
          <div className="section-title">🔧 System Status</div>
          <div className="health-list">
            <HealthRow label="Backend API" ok={!!health}                         detail={health ? 'Reachable' : 'Unreachable'} />
            <HealthRow label="MongoDB"     ok={health?.mongo === 'connected'}    detail={health?.mongo ?? '—'} />
            <HealthRow label="ALPR Engine" ok={!!health}                         detail={health ? 'Ready' : 'Offline'} />
          </div>
        </div>

        {/* Model Information */}
        <div className="card">
          <div className="section-title">🤖 Models</div>
          <div className="model-list">
            <ModelRow
              name="License Plate Detector"
              id="nickmuchi/yolo-v9-s-608-license-plate-end2end"
              type="YOLOv9-S · ONNX"
              note="608×608 end-to-end"
            />
            <ModelRow
              name="Character Recognition"
              id="nickmuchi/cct-s-v2-global-model"
              type="CCT-S v2 · ONNX"
              note="Global plate classifier"
            />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="card">
          <div className="section-title">📈 Detection Quality</div>
          {loading || !stats ? (
            <div className="loading-state">Loading…</div>
          ) : (
            <div className="quality-grid">
              <QualityStat
                label="Avg plates / image"
                value={stats.total > 0 ? (stats.upload > 0 ? (stats.total / stats.upload).toFixed(1) : '—') : '—'}
              />
              <QualityStat label="Images in DB" value={(stats.upload ?? 0).toLocaleString()} />
              <QualityStat label="Recent (24h)"  value={(stats.last24h ?? 0).toLocaleString()} />
              <QualityStat label="Unique plates" value={(stats.topPlates?.length ?? 0).toLocaleString() + (stats.topPlates?.length === 10 ? '+' : '')} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, ok, detail }) {
  return (
    <div className="health-row">
      <span className={`health-dot ${ok ? 'green' : 'red'}`} />
      <span className="health-label">{label}</span>
      <span className={`health-detail ${ok ? '' : 'bad'}`}>{detail}</span>
    </div>
  );
}

function ModelRow({ name, id, type, note }) {
  return (
    <div className="model-row">
      <div className="model-name">{name}</div>
      <div className="model-id">
        <a href={`https://huggingface.co/${id}`} target="_blank" rel="noreferrer">
          🤗 {id}
        </a>
      </div>
      <div className="model-meta">
        <span className="badge badge-blue">{type}</span>
        <span className="model-note">{note}</span>
      </div>
    </div>
  );
}

function QualityStat({ label, value }) {
  return (
    <div className="quality-stat">
      <span className="qs-value">{value}</span>
      <span className="qs-label">{label}</span>
    </div>
  );
}
