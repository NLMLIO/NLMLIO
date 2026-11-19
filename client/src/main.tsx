import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadSounds } from './audio/sounds';

// 효과음은 앱 시작 시 미리 불러 둔다(FUNC-005-14).
preloadSounds();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
