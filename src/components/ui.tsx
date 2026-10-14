import React from 'react';

/**
 * Элементы дизайн-системы 0.4.3.
 *
 * Перенесены из макета редизайна (docs/design/zapret2_control_center.tsx):
 * там они рисовались инлайновыми стилями поверх объекта темы, здесь — теми же
 * значениями, но классами Tailwind на токенах темы (bg-s1, text-t2,
 * border-line, bg-ac). Тема и акцент меняются переменными, компонентам об
 * этом знать не нужно.
 *
 * Статусные цвета отдельно от акцента и не меняются никогда: зелёный —
 * работает, янтарный — предупреждение, красный — ошибка, серый — выключено.
 */

type Icon = React.ComponentType<{ className?: string }>;

/** Склонение по числу: plural(31, ['способ', 'способа', 'способов']) → «способ». */
export const plural = (n: number, forms: [string, string, string]): string => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

// --- Кнопка -------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] gap-1.5 rounded-[8px]',
  md: 'px-3.5 py-2 text-[13px] gap-2 rounded-[8px]',
  lg: 'px-5 py-2.5 text-[14px] gap-2 rounded-[10px]',
};

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ac text-white border border-white/[0.16] shadow-[0_2px_12px_rgb(var(--accent-500)/0.18)]',
  secondary: 'bg-white/[0.05] text-t1 border border-white/[0.09] hover:bg-white/[0.08]',
  danger: 'bg-red-500/[0.12] text-red-300 border border-red-500/[0.28]',
  success: 'bg-green-500/[0.12] text-green-300 border border-green-500/[0.28]',
  ghost: 'bg-transparent text-t2 border border-transparent hover:bg-white/[0.05] hover:text-t1',
};

export const Button: React.FC<{
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Icon;
  /** Иконка крутится — для «Идёт проверка…». */
  spin?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
  children?: React.ReactNode;
}> = ({ variant = 'primary', size = 'md', icon: IconCmp, spin, onClick, disabled, title, type = 'button', className = '', children }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 hover:brightness-110 active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none select-none ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${className}`}
  >
    {IconCmp && <IconCmp className={`w-3.5 h-3.5 shrink-0 ${spin ? 'animate-spin' : ''}`} />}
    {children}
  </button>
);

// --- Карточка -----------------------------------------------------------

export type Tone = 'default' | 'ok' | 'warn' | 'bad' | 'accent';

const CARD_TONE: Record<Tone, string> = {
  default: 'border-line',
  ok: 'border-green-500/[0.28]',
  warn: 'border-amber-500/[0.28]',
  bad: 'border-red-500/[0.28]',
  accent: 'border-ac/40',
};

export const Card: React.FC<{
  tone?: Tone;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}> = ({ tone = 'default', className = '', children, onClick }) => (
  <div onClick={onClick} className={`rounded-[12px] bg-s1 border ${CARD_TONE[tone]} ${className}`}>
    {children}
  </div>
);

/** Заголовок карточки: название слева, действия справа. */
export const CardHead: React.FC<{
  icon?: Icon;
  iconClass?: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon: IconCmp, iconClass = 'text-ac', title, hint, actions, className = '' }) => (
  <div className={`flex items-center justify-between gap-3 ${className}`}>
    <div className="flex items-center gap-2 min-w-0">
      {IconCmp && <IconCmp className={`w-4 h-4 shrink-0 ${iconClass}`} />}
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-t1 truncate">{title}</div>
        {hint && <div className="text-[11px] text-t2 leading-snug">{hint}</div>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/** Плашка-строка внутри карточки — второй слой поверхности. */
export const Row: React.FC<{ className?: string; children?: React.ReactNode; onClick?: () => void }> = ({ className = '', children, onClick }) => (
  <div onClick={onClick} className={`rounded-[8px] bg-s2 border border-line ${className}`}>{children}</div>
);

// --- Заголовок экрана ---------------------------------------------------

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: () => void;
  backIcon?: Icon;
}> = ({ title, subtitle, actions, back, backIcon: BackIcon }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2.5 min-w-0">
      {back && BackIcon && (
        <button
          type="button"
          onClick={back}
          className="p-1.5 rounded-[8px] border border-line text-t2 hover:bg-white/[0.05] hover:text-t1 shrink-0"
        >
          <BackIcon className="w-4 h-4" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-[16px] font-semibold text-t1 truncate">{title}</h1>
        {subtitle && <p className="text-[12px] text-t2 leading-snug">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// --- Переключатель ------------------------------------------------------

export const Toggle: React.FC<{
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  /** Янтарный вместо акцента — для настроек с риском. */
  warn?: boolean;
  title?: string;
}> = ({ checked, onChange, disabled, warn, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title}
    onClick={(e) => { e.stopPropagation(); if (!disabled && onChange) onChange(!checked); }}
    disabled={disabled}
    className={`relative inline-flex items-center rounded-full transition-colors duration-200 shrink-0 w-9 h-5 disabled:opacity-45 ${
      checked ? (warn ? 'bg-amber-500' : 'bg-ac') : 'bg-white/[0.13]'
    }`}
  >
    <span
      className={`inline-block w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
        checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

// --- Статусная точка ----------------------------------------------------

export type Status = 'ok' | 'warn' | 'bad' | 'neutral';

const DOT: Record<Status, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-t3',
};

export const StatusDot: React.FC<{ status: Status; pulse?: boolean; size?: number }> = ({ status, pulse, size = 8 }) => (
  <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
    {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${DOT[status]}`} />}
    <span className={`relative inline-flex rounded-full ${DOT[status]}`} style={{ width: size, height: size }} />
  </span>
);

// --- Бейдж --------------------------------------------------------------

const BADGE: Record<Status | 'accent', string> = {
  ok: 'bg-green-500/[0.12] text-green-400 border-green-500/[0.28]',
  warn: 'bg-amber-500/[0.12] text-amber-300 border-amber-500/[0.28]',
  bad: 'bg-red-500/[0.12] text-red-300 border-red-500/[0.28]',
  neutral: 'bg-s2 text-t2 border-line',
  accent: 'bg-ac/15 text-ac-300 border-ac/40',
};

export const Badge: React.FC<{ tone?: Status | 'accent'; mono?: boolean; className?: string; children?: React.ReactNode; title?: string }> = ({ tone = 'neutral', mono, className = '', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium border ${mono ? 'font-mono' : ''} ${BADGE[tone]} ${className}`}>
    {children}
  </span>
);

// --- Плашка-уведомление -------------------------------------------------

const NOTE: Record<Exclude<Status, 'neutral'> | 'neutral' | 'accent', { box: string; text: string }> = {
  ok: { box: 'bg-green-500/[0.12] border-green-500/[0.28]', text: 'text-green-300' },
  warn: { box: 'bg-amber-500/[0.12] border-amber-500/[0.28]', text: 'text-amber-200' },
  bad: { box: 'bg-red-500/[0.12] border-red-500/[0.28]', text: 'text-red-300' },
  neutral: { box: 'bg-s2 border-line', text: 'text-t2' },
  accent: { box: 'bg-ac/15 border-ac/40', text: 'text-t1' },
};

export const Note: React.FC<{ tone?: keyof typeof NOTE; icon?: Icon; className?: string; children?: React.ReactNode }> = ({ tone = 'neutral', icon: IconCmp, className = '', children }) => (
  <div className={`flex items-start gap-2 px-3 py-2 rounded-[8px] border text-[12px] leading-relaxed ${NOTE[tone].box} ${NOTE[tone].text} ${className}`}>
    {IconCmp && <IconCmp className="w-4 h-4 shrink-0 mt-px" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

// --- Сегментированные вкладки -------------------------------------------

export function Segmented<T extends string>({ value, onChange, items, disabled, size = 'md' }: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: React.ReactNode; icon?: Icon; extra?: React.ReactNode }[];
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex p-1 rounded-[10px] gap-1 bg-s1 border border-line max-w-full overflow-x-auto">
      {items.map(it => {
        const IconCmp = it.icon;
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(it.id)}
            className={`${size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[12px]'} rounded-[7px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-40 ${
              on ? 'bg-s3 text-white' : 'text-t2 hover:text-t1'
            }`}
          >
            {IconCmp && <IconCmp className="w-3.5 h-3.5" />}
            <span>{it.label}</span>
            {it.extra}
          </button>
        );
      })}
    </div>
  );
}

// --- Строка-настройка с переключателем ----------------------------------

export const SwitchRow: React.FC<{
  icon?: Icon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  warn?: boolean;
  className?: string;
}> = ({ icon: IconCmp, title, hint, checked, onChange, warn, className = '' }) => (
  <div
    onClick={() => onChange(!checked)}
    className={`flex items-start gap-3 px-3 py-2.5 rounded-[8px] bg-s2 border border-line cursor-pointer hover:bg-white/[0.03] transition-colors ${className}`}
  >
    {IconCmp && (
      <div className={`p-1.5 rounded-[7px] shrink-0 ${checked ? (warn ? 'bg-amber-500/15 text-amber-400' : 'bg-ac/15 text-ac-300') : 'bg-white/[0.05] text-t3'}`}>
        <IconCmp className="w-3.5 h-3.5" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-[12px] font-medium text-t1">{title}</div>
      {hint && <div className="text-[11px] text-t2 leading-snug mt-0.5">{hint}</div>}
    </div>
    <div className="pt-0.5"><Toggle checked={checked} onChange={onChange} warn={warn} /></div>
  </div>
);

// --- Прогресс -----------------------------------------------------------

export const Progress: React.FC<{ value: number; tone?: 'accent' | 'ok' | 'warn'; className?: string }> = ({ value, tone = 'accent', className = '' }) => (
  <div className={`w-full h-2 rounded-full overflow-hidden bg-s3 ${className}`}>
    <div
      className={`h-full rounded-full transition-all duration-500 ${tone === 'ok' ? 'bg-green-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-ac'}`}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

// --- Пустое состояние ---------------------------------------------------

export const Empty: React.FC<{ icon: Icon; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode }> = ({ icon: IconCmp, title, text, action }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-1.5">
    <IconCmp className="w-8 h-8 mb-1 text-t3" />
    <div className="text-[14px] font-semibold text-t1">{title}</div>
    {text && <p className="text-[12px] text-t2 max-w-md leading-relaxed">{text}</p>}
    {action && <div className="pt-1.5">{action}</div>}
  </div>
);
