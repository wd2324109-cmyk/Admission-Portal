import React from 'react'; import { createRoot } from 'react-dom/client';
import App from './App.jsx'; import NotFound from './NotFound.jsx'; import { ErrorBoundary } from './security.jsx'; import './styles.css';

// Any address other than the site root shows the "page not found" screen (the server also answers with a real 404 status).
const base = import.meta.env.BASE_URL.replace(/\/$/, ''), path = window.location.pathname.replace(/\/$/, '');
const home = path === base || path === base + '/index.html';
createRoot(document.getElementById('root')).render(<ErrorBoundary>{home ? <App /> : <NotFound />}</ErrorBoundary>);
