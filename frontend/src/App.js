import React, { useState, useCallback } from 'react';
import Navbar from './components/Navbar';
import Upload from './pages/Upload';
import Results from './pages/Results';
import Dashboard from './pages/Dashboard';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('upload');
  // Lift upload results so Results tab can auto-refresh after an upload
  const [lastUploadTs, setLastUploadTs] = useState(null);

  const onUploadComplete = useCallback(() => {
    setLastUploadTs(Date.now());
  }, []);

  return (
    <div className="app">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'upload' && (
          <Upload onUploadComplete={onUploadComplete} />
        )}
        {activeTab === 'results' && (
          <Results lastUploadTs={lastUploadTs} />
        )}
        {activeTab === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}
