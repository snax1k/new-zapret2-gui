import React from 'react';

/**
 * Значок «Z2» для интерфейса — тот же рисунок, что в app.ico
 * (assets/icon/icon-20.svg): сетка 20×20 подогнана под пиксели, поэтому
 * в заголовке окна (20 px) края не плывут. Двойка берёт цвет акцента темы.
 */
export const AppLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
    <rect x="0.5" y="0.5" width="19" height="19" rx="4.25" fill="#1E1F25" stroke="#FFFFFF" strokeOpacity="0.08" />
    <path fill="#F0F0F3" d="M3 5H10V7L6 13H10V15H3V13L7 7H3Z" />
    <path className="fill-ac-400" d="M11 5H14.5A2.5 2.5 0 0 1 17 7.5V8.5L14 13H17V15H11V14.5L15 8.5V7.5A0.5 0.5 0 0 0 14.5 7H11Z" />
  </svg>
);
