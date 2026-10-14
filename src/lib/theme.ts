/**
 * Цветовая схема приложения.
 *
 * С 0.4.3 оформление только тёмное, в двух вариантах: «Чёрная» (чистый
 * чёрный, для OLED) и «Тёмная» (графит). Токены взяты из дизайн-системы
 * редизайна (New Design/zapret2_control_center.tsx).
 *
 * Как это доходит до разметки. Старые компоненты написаны классами Tailwind
 * `indigo-*` (акцент) и `slate-*` (поверхности и текст) — таких мест почти
 * девятьсот, поэтому в `tailwind.config.js` обе палитры объявлены через
 * CSS-переменные, а здесь эти переменные подставляются в `<html>`. Новые
 * компоненты пользуются токенами напрямую: `bg-app`, `bg-s1..s3`,
 * `text-t1..t3`, `border-line`, `bg-ac`.
 *
 * Формат переменных «R G B» без rgb() — так работает модификатор
 * прозрачности Tailwind: `bg-ac/15` превращается в `rgb(var(--accent-500) / 0.15)`.
 */

export type ThemeMode = 'dark' | 'light';

/** Ступени палитры. Ровно те, что использует Tailwind. */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type Ramp = Record<number, [number, number, number]>;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const ramp = (hexes: string[]): Ramp => {
  const out: Ramp = {};
  STOPS.forEach((stop, i) => { out[stop] = hexToRgb(hexes[i]); });
  return out;
};

// --- Акценты ----------------------------------------------------------

export interface AccentDef {
  id: string;
  label: string;
  /** Цвет кружка в настройках — 500-я ступень. */
  swatch: string;
  ramp: Ramp;
  /** Тон в градусах — для подбора акцента под картинку фона. */
  hue: number;
}

export const ACCENTS: AccentDef[] = [
  {
    // Акцент редизайна: #7C6CFF на 500-й ступени, остальное — вокруг него.
    id: 'violet',
    label: 'Фиолетово-синий',
    swatch: '#7C6CFF',
    hue: 247,
    ramp: ramp(['#F3F1FF', '#E8E5FF', '#D3CDFF', '#B5ABFF', '#9A8DFF', '#7C6CFF',
                '#6A57F5', '#5A45DB', '#4A39B3', '#3D318C', '#241C55'])
  },
  {
    id: 'blue',
    label: 'Синий',
    swatch: '#3B82F6',
    hue: 217,
    ramp: ramp(['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6',
                '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'])
  },
  {
    id: 'cyan',
    label: 'Бирюзовый',
    swatch: '#06B6D4',
    hue: 189,
    ramp: ramp(['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4',
                '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'])
  },
  {
    id: 'red',
    label: 'Красный',
    swatch: '#F43F5E',
    hue: 350,
    ramp: ramp(['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e',
                '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'])
  }
];

/**
 * Акцент по id. Неизвестные — это выбор из прежних версий (индиго, изумруд,
 * янтарь): у них нет пары в новой палитре, поэтому — акцент по умолчанию.
 */
export const getAccent = (id: string): AccentDef =>
  ACCENTS.find(a => a.id === id) || ACCENTS[0];

/** Акцент, ближайший к заданному тону — когда фоном ставят свою картинку. */
export const nearestAccent = (hue: number): string => {
  let best = ACCENTS[0].id;
  let bestDist = 999;
  ACCENTS.forEach(a => {
    // Расстояние по кругу: 0 для совпадающих тонов, 180 для противоположных.
    const dist = Math.abs(((a.hue - hue + 540) % 360) - 180);
    if (dist < bestDist) { bestDist = dist; best = a.id; }
  });
  return best;
};

// --- Темы (поверхности) -----------------------------------------------

export interface BackgroundDef {
  id: string;
  label: string;
  /** Фон окна и три слоя поверхностей. */
  bg: string;
  s1: string;
  s2: string;
  s3: string;
  /** Прозрачность обычной и усиленной границы (белый). */
  line: number;
  lineStrong: number;
  /**
   * Ряд `slate` для старых компонентов: 950 — фон, 900 — панели, 800 —
   * приподнятые элементы, 400 и светлее — текст.
   */
  surface: Ramp;
}

const TEXT_RAMP = ['#FAFAFA', '#EDEDEF', '#DCDCE0', '#C4C4CC', '#A1A1AA', '#6B6B76'];

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'black',
    label: 'Чёрная (OLED)',
    bg: '#000000', s1: '#0B0B0D', s2: '#121214', s3: '#1A1A1D',
    line: 0.07, lineStrong: 0.13,
    surface: ramp([...TEXT_RAMP, '#4A4A52', '#2E2E33', '#1A1A1D', '#0B0B0D', '#000000'])
  },
  {
    id: 'graphite',
    label: 'Тёмная (графит)',
    bg: '#0E0F12', s1: '#15161A', s2: '#1C1D22', s3: '#24252B',
    line: 0.08, lineStrong: 0.15,
    surface: ramp([...TEXT_RAMP, '#4A4B53', '#33343B', '#24252B', '#15161A', '#0E0F12'])
  }
];

/** Тема по id. Прежние «фоны-оттенки» (Графит, Чернила, Хвоя…) — в чёрную. */
export const getBackground = (id: string): BackgroundDef =>
  BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];

// --- Применение -------------------------------------------------------

const setRamp = (el: HTMLElement, prefix: string, r: Ramp) => {
  STOPS.forEach(stop => {
    const [red, green, blue] = r[stop];
    el.style.setProperty(`--${prefix}-${stop}`, `${red} ${green} ${blue}`);
  });
};

const setRgb = (el: HTMLElement, name: string, hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  el.style.setProperty(name, `${r} ${g} ${b}`);
};

export interface ThemeState {
  accent: string;
  background: string;
  /** Своя картинка фоном, data-URL. Пусто — сплошной фон темы. */
  customImage: string;
}

/**
 * Раскладывает тему по CSS-переменным корневого элемента.
 *
 * Вызывать при любом изменении темы. Класс `dark` ставится всегда: на нём
 * держатся `dark:`-классы старых компонентов, а светлой темы больше нет.
 */
export const applyTheme = (t: ThemeState) => {
  const root = document.documentElement;
  root.classList.add('dark');

  const bg = getBackground(t.background);
  root.dataset.theme = bg.id;
  setRamp(root, 'accent', getAccent(t.accent).ramp);
  setRamp(root, 'surface', bg.surface);

  setRgb(root, '--c-bg', bg.bg);
  setRgb(root, '--c-s1', bg.s1);
  setRgb(root, '--c-s2', bg.s2);
  setRgb(root, '--c-s3', bg.s3);
  root.style.setProperty('--c-line', String(bg.line));
  root.style.setProperty('--c-line-strong', String(bg.lineStrong));

  // Своя картинка идёт под затемняющий слой: без него текст поверх снимка
  // нечитаем. Панели остаются сплошными — картинка видна в просветах.
  if (t.customImage) {
    const scrim = 'linear-gradient(rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.62))';
    root.style.setProperty('--app-bg-image', `${scrim}, url("${t.customImage}")`);
  } else {
    root.style.setProperty('--app-bg-image', 'none');
  }
};

/**
 * Средний тон картинки — чтобы подобрать к ней акцент.
 *
 * Считается по уменьшенной до 32x32 копии. Тёмные и почти серые пиксели тон
 * задают плохо, поэтому берутся только достаточно яркие и цветные.
 */
export const averageHueOfImage = (dataUrl: string): Promise<{ hue: number; sat: number }> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const N = 32;
        const c = document.createElement('canvas');
        c.width = N;
        c.height = N;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve({ hue: 247, sat: 1 });
        ctx.drawImage(img, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;

        // Тон усредняем через вектор: среднее арифметическое углов
        // бессмысленно, 350° и 10° дали бы 180° вместо 0°.
        let x = 0;
        let y = 0;
        let satSum = 0;
        let count = 0;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255;
          const g = d[i + 1] / 255;
          const b = d[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const delta = max - min;
          if (delta < 0.08 || l < 0.08 || l > 0.95) continue;

          const s = delta / (1 - Math.abs(2 * l - 1));
          let h: number;
          if (max === r) h = ((g - b) / delta) % 6;
          else if (max === g) h = (b - r) / delta + 2;
          else h = (r - g) / delta + 4;
          h *= 60;
          if (h < 0) h += 360;

          const rad = (h * Math.PI) / 180;
          x += Math.cos(rad) * s;
          y += Math.sin(rad) * s;
          satSum += s;
          count++;
        }

        if (count === 0) return resolve({ hue: 247, sat: 0 });

        let hue = (Math.atan2(y, x) * 180) / Math.PI;
        if (hue < 0) hue += 360;
        const sat = Math.min((satSum / count) * 2.2, 1.6);
        resolve({ hue: Math.round(hue), sat: Math.round(sat * 100) / 100 });
      } catch {
        resolve({ hue: 247, sat: 1 });
      }
    };
    img.onerror = () => resolve({ hue: 247, sat: 1 });
    img.src = dataUrl;
  });

/**
 * Ужимает выбранный файл до пригодного для хранения размера.
 *
 * Картинка хранится в настройках — снимок с телефона легко весит больше
 * разумного. Ужимаем до 1600 px по длинной стороне и пишем в JPEG.
 */
export const shrinkImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('это не изображение'));
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const k = Math.min(MAX / width, MAX / height);
          width = Math.round(width * k);
          height = Math.round(height * k);
        }
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('нет canvas'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
