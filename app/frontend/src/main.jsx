import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import NotFound from './app/NotFound.jsx';
import { ErrorBoundary } from './security/index.js';
import { ConfirmProvider } from './components/ui/index.js';
import './styles/index.css';

const base = import.meta.env.BASE_URL.replace(/\/$/, ''), path = window.location.pathname.replace(/\/$/, '');
const home = path === base || path === base + '/index.html';
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>{home ? <ConfirmProvider><App /></ConfirmProvider> : <NotFound />}</ErrorBoundary>
);
