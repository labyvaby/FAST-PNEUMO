import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import './index.css';
import './tools.css';
import { LaunchProvider } from './LaunchContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LaunchProvider>
      <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <App />
      </Router>
    </LaunchProvider>
  </React.StrictMode>
);
