import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css';
import 'wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css';
import '@fontsource-variable/geist';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
