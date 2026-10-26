import React from 'react'; import { createRoot } from 'react-dom/client';
import App from './App.jsx'; import NotFound from './NotFound.jsx'; import './styles.css';

                                                                                                                     
const base = import.meta.env.BASE_URL.replace(/\/$/, ''), path = window.location.pathname.replace(/\/$/, '');
const home = path === base || path === base + '/index.html';
createRoot(document.getElementById('root')).render(home ? <App /> : <NotFound />);
