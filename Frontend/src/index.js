import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_KEEP_CONSOLE !== 'true') {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
