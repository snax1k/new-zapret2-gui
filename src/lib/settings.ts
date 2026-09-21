/**
 * Хранилище настроек приложения.
 *
 * ПОЧЕМУ НЕ localStorage НАПРЯМУЮ
 *
 * Хранилище браузера пишет на диск не сразу: изменения копятся в памяти и
 * сбрасываются пачкой через несколько секунд простоя либо при аккуратном
 * закрытии движка. Наше приложение закрывалось через Application.Exit(), не
 * дав WebView2 закрыться по-человечески, и процесс браузера убивался вместе
 * с нашим. Всё, что пользователь поменял за секунды до выхода, терялось.
 *
 * Выглядело это как «пресет не запоминается»: выбрал другой, сразу закрыл,
 * открыл — снова старый. А если после изменения посидеть подольше, всё
 * сохранялось. Отсюда ощущение случайности.
 *
 * Поэтому настоящее хранилище — обычный файл settings.json рядом с логами,
 * который пишет нативная часть синхронно, сразу при изменении. При запуске
 * она отдаёт его содержимое странице ДО того, как та загрузится
 * (AddScriptToExecuteOnDocumentCreated), поэтому гонки «что прочитается
 * раньше» здесь нет.
 *
 * localStorage остаётся как запасной путь: в браузере при разработке, где
 * нативной части нет, и как страховка на случай, если файл не прочитался.
 */

/** Значения, вложенные нативной частью до загрузки страницы. */
const injected: Record<string, string> = (() => {
  const raw = (window as any).__zapret_settings;
  return raw && typeof raw === 'object' ? { ...raw } : {};
})();

const hasNative = () => !!window.chrome?.webview;

let pushTimer: number | undefined;

/**
 * Отправляет весь набор настроек нативной части.
 *
 * Пачкой и с небольшой задержкой: смена темы или перебор переключателей
 * дают несколько изменений подряд, а писать файл на каждое нажатие незачем.
 * Задержка маленькая — 150 мс: это защита от лишних записей, а не тот
 * многосекундный буфер, из-за которого всё и ломалось.
 */
const schedulePush = () => {
  if (!hasNative()) return;
  if (pushTimer !== undefined) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = undefined;
    try {
      window.chrome!.webview!.postMessage('save_settings:' + JSON.stringify(injected));
    } catch { }
  }, 150);
};

/** Читает настройку: сначала файл от нативной части, потом localStorage. */
export const loadSetting = (key: string): string | null => {
  if (Object.prototype.hasOwnProperty.call(injected, key)) return injected[key];
  try { return localStorage.getItem(key); } catch { return null; }
};

/**
 * Порог, после которого значение в файл не едет.
 *
 * Своё изображение фоном хранится как data-URI и легко весит мегабайты.
 * Гонять его через канал сообщений при каждом изменении и переписывать им
 * файл настроек незачем: потеря картинки при аварийном закрытии — это
 * «фон вернулся к обычному», а не «слетели все настройки».
 */
const MAX_MIRRORED = 64 * 1024;

/** Сохраняет настройку в файл и в localStorage. */
export const saveSetting = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { }

  if (value.length > MAX_MIRRORED) {
    // В файле такого ключа быть не должно: иначе он останется там навсегда
    // со старым значением и будет перебивать свежее из localStorage.
    delete injected[key];
    schedulePush();
    return;
  }

  injected[key] = value;
  schedulePush();
};

/** Удаляет настройку из обоих хранилищ. */
export const removeSetting = (key: string): void => {
  delete injected[key];
  try { localStorage.removeItem(key); } catch { }
  schedulePush();
};

/**
 * Сбрасывает накопленные изменения немедленно.
 *
 * Вызывается перед закрытием приложения: если пользователь что-то поменял и
 * сразу нажал крестик, отложенная на 150 мс отправка могла не успеть.
 */
export const flushSettings = (): void => {
  if (!hasNative()) return;
  if (pushTimer !== undefined) {
    window.clearTimeout(pushTimer);
    pushTimer = undefined;
  }
  try {
    window.chrome!.webview!.postMessage('save_settings:' + JSON.stringify(injected));
  } catch { }
};
