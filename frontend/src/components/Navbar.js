import React from 'react';
import './Navbar.css';

export default function Navbar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'upload',    label: 'Upload',    icon: '📤' },
    { id: 'results',   label: 'Results',   icon: '📋' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="navbar-logo">🚗</span>
        <div className="navbar-title-wrap">
          <span className="navbar-title">ALPR</span>
          <span className="navbar-sub">License Plate Recognition</span>
        </div>
      </div>

      <div className="navbar-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="navbar-right">
        <span className="navbar-badge">India / Gujarat</span>
      </div>
    </nav>
  );
}
