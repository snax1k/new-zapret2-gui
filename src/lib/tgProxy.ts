import { TgProxySettings } from '../types';

/**
 * Ссылка, по которой Telegram сам добавит прокси себе в настройки.
 *
 * Префикс `dd` у секрета означает режим с добавочным случайным заполнением —
 * тот же, что использует эталонная реализация. Клиент разбирает ссылку
 * штатным обработчиком схемы `tg:`, никаких ухищрений со стороны программы
 * не требуется: достаточно отдать строку системе.
 */
export const buildTgLink = (host: string, port: number, secret: string): string =>
  `tg://proxy?server=${host}&port=${port}&secret=dd${secret}`;

/**
 * Новый секрет: 16 случайных байт в шестнадцатеричном виде.
 *
 * Секрет — это единственное, что отличает наш слушатель от чужого. Сканер,
 * наткнувшийся на открытый порт, без него дальше рукопожатия не пройдёт.
 */
export const generateTgSecret = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
};

export const isValidTgSecret = (secret: string): boolean => /^[0-9a-f]{32}$/.test(secret);

export const DEFAULT_TG_PORT = 1443;

export const DEFAULT_TG_SETTINGS: TgProxySettings = {
  port: DEFAULT_TG_PORT,
  secret: '',
  lanAccess: false,
  autoStart: false,
  // Прямое соединение оставлено включённым: если дата-центры у провайдера
  // открыты, это самый короткий путь, и мост не должен мешать.
  allowDirectTcp: true,
  allowFronting: true,
  allowCloudflare: true,
};

/** Привести прочитанное из настроек к рабочему виду, не доверяя содержимому. */
export const normalizeTgSettings = (raw: unknown): TgProxySettings => {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<TgProxySettings>;
  const port = Number(s.port);
  return {
    port: Number.isFinite(port) && port >= 1 && port <= 65535 ? Math.floor(port) : DEFAULT_TG_PORT,
    secret: typeof s.secret === 'string' && isValidTgSecret(s.secret) ? s.secret : '',
    lanAccess: !!s.lanAccess,
    autoStart: !!s.autoStart,
    allowDirectTcp: s.allowDirectTcp !== false,
    allowFronting: s.allowFronting !== false,
    allowCloudflare: s.allowCloudflare !== false,
  };
};
