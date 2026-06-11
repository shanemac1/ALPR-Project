import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL}/api`
    : '/api',
  timeout: 120000,
});

export const getDetections = (params = {}) =>
  API.get('/detections', { params }).then(r => r.data);

export const deleteDetection = (id) =>
  API.delete(`/detections/${id}`).then(r => r.data);

export const clearDetections = () =>
  API.delete('/detections').then(r => r.data);

export const getStats = () =>
  API.get('/detections/stats/summary').then(r => r.data);

export const uploadImages = (files, onProgress) => {
  const fd = new FormData();
  files.forEach(f => fd.append('images', f));
  return API.post('/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  }).then(r => r.data);
};

export const getHealth = () =>
  API.get('/health').then(r => r.data);

export default API;
