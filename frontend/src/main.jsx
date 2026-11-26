import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/home.css';
import './styles/developers.css';
import './styles/app.css';
import './styles/mode-switch.css';
import './styles/appliances.css';
import { App } from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

