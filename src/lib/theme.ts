/**
 * Цветовая схема приложения.
 *
 * Интерфейс написан обычными классами Tailwind: акцент — `indigo-*`,
 * поверхности и текст — `slate-*`. Таких мест почти девятьсот, менять их
 * руками нельзя. Поэтому в `tailwind.config.js` обе палитры объявлены через
 * CSS-переменные, а здесь эти переменные считаются и подставляются в
 * `<html>`. Ни один компонент об этом не знает и знать не должен.
 *
 * Переменные хранятся в формате «R G B» без функции rgb() — так работает
 * модификатор прозрачности Tailwind: `bg-indigo-600/20` превращается в
 * `rgb(var(--accent-600) / 0.2)`.
 */

export type ThemeMode = 'dark' | 'light';

/** Ступени палитры. Ровно те, что использует Tailwind. */
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type Ramp = Record<number, [number, number, number]>;

// --- Акценты ----------------------------------------------------------
//
// Палитры взяты у Tailwind целиком, а не выведены из одного тона: подобранные
// вручную ряды выглядят ровно, а рассчитанные из чистого HSL уходят в грязь на
// средних ступенях. Здесь важнее предсказуемость, чем экономия строк.

export interface AccentDef {
  id: string;
  label: string;
  /** Цвет кружка в настройках — 500-я ступень. */
  swatch: string;
  ramp: Ramp;
}

const ramp = (hexes: string[]): Ramp => {
  const out: Ramp = {};
  STOPS.forEach((stop, i) => {
    const h = hexes[i].replace('#', '');
    out[stop] = [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  });
  return out;
};

export const ACCENTS: AccentDef[] = [
  {
    id: 'indigo',
    label: 'Индиго',
    swatch: '#6366f1',
    ramp: ramp(['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1',
                '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'])
  },
  {
    id: 'red',
    label: 'Красный',
    swatch: '#ef4444',
    ramp: ramp(['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444',
                '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'])
  },
  {
    id: 'emerald',
    label: 'Изумруд',
    swatch: '#10b981',
    ramp: ramp(['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981',
                '#059669', '#047857', '#065f46', '#064e3b', '#022c22'])
  },
  {
    id: 'amber',
    label: 'Янтарь',
    swatch: '#f59e0b',
    ramp: ramp(['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b',
                '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'])
  },
  {
    id: 'violet',
    label: 'Фиолетовый',
    swatch: '#8b5cf6',
    ramp: ramp(['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6',
                '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'])
  },
  {
    id: 'cyan',
    label: 'Бирюза',
    swatch: '#06b6d4',
    ramp: ramp(['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4',
                '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'])
  }
];

export const getAccent = (id: string): AccentDef =>
  ACCENTS.find(a => a.id === id) || ACCENTS[0];

/** Тон каждого акцента в градусах — для подбора акцента под картинку. */
const ACCENT_HUE: Record<string, number> = {
  indigo: 239,
  red: 0,
  emerald: 160,
  amber: 38,
  violet: 258,
  cyan: 189
};

/**
 * Акцент, ближайший к заданному тону.
 *
 * Нужен, когда фоном ставят свою картинку: оставлять при оранжевом снимке
 * изумрудные кнопки — это ровно та несогласованность, ради которой тему и
 * подстраивают под фон. Расстояние считается по кругу, иначе 350° и 10°
 * оказались бы противоположными.
 */
export const nearestAccent = (hue: number): string => {
  let best = 'indigo';
  let bestDist = 999;
  Object.keys(ACCENT_HUE).forEach(id => {
    // |((a - b + 540) % 360) - 180| — это и есть расстояние по кругу:
    // 0 для совпадающих тонов, 180 для противоположных.
    const dist = Math.abs(((ACCENT_HUE[id] - hue + 540) % 360) - 180);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  });
  return best;
};

// --- Поверхности ------------------------------------------------------
//
// Ряд `slate` держит на себе и панели, и текст: `text-slate-900` на светлой
// теме, `text-slate-100` на тёмной. Поэтому тонировать его можно только по
// тону и насыщенности — светлота каждой ступени остаётся ровно такой, какая
// была у Tailwind. Иначе первым же делом поплывёт контраст текста.

/** Светлота ступеней slate у Tailwind, в процентах. */
const SURFACE_L = [98, 96.1, 91.4, 83.9, 65.1, 46.9, 34.5, 26.7, 17.5, 11.2, 4.9];
/** Насыщенность тех же ступеней. Крайние темнее и насыщеннее середины. */
const SURFACE_S = [40, 40, 31.8, 26.8, 20.2, 16.3, 19.3, 25, 32.6, 47.4, 84];

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(255 * f(0)),
    Math.round(255 * f(8)),
    Math.round(255 * f(4))
  ];
};

/**
 * Ряд поверхностей под заданный тон.
 *
 * @param hue    тон в градусах
 * @param satMul множитель насыщенности: 0 — нейтральный серый, 1 — как у
 *               стандартного slate, выше 1.6 цвет начинает спорить с акцентом
 */
export const buildSurfaceRamp = (hue: number, satMul: number): Ramp => {
  const out: Ramp = {};
  STOPS.forEach((stop, i) => {
    out[stop] = hslToRgb(hue, Math.min(SURFACE_S[i] * satMul, 90), SURFACE_L[i]);
  });
  return out;
};

// --- Фоны -------------------------------------------------------------

export interface BackgroundDef {
  id: string;
  label: string;
  /** Тон поверхностей, градусы. */
  hue: number;
  /** Множитель насыщенности поверхностей. */
  sat: number;
  /** Акцент, который идёт к этому фону по умолчанию. */
  accent: string;
}

export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'slate',   label: 'Графит',    hue: 217, sat: 1,    accent: 'indigo' },
  { id: 'ink',     label: 'Чернила',   hue: 230, sat: 1.35, accent: 'violet' },
  { id: 'crimson', label: 'Багрянец',  hue: 350, sat: 1.1,  accent: 'red' },
  { id: 'forest',  label: 'Хвоя',      hue: 155, sat: 1.1,  accent: 'emerald' },
  { id: 'ocean',   label: 'Океан',     hue: 200, sat: 1.3,  accent: 'cyan' },
  { id: 'sand',    label: 'Песок',     hue: 35,  sat: 0.9,  accent: 'amber' },
  { id: 'plum',    label: 'Слива',     hue: 290, sat: 1.15, accent: 'violet' },
  { id: 'neutral', label: 'Нейтральный', hue: 217, sat: 0,  accent: 'indigo' }
];

export const getBackground = (id: string): BackgroundDef =>
  BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];

// --- Применение -------------------------------------------------------

const setRamp = (el: HTMLElement, prefix: string, r: Ramp) => {
  STOPS.forEach(stop => {
    const [red, green, blue] = r[stop];
    el.style.setProperty(`--${prefix}-${stop}`, `${red} ${green} ${blue}`);
  });
};

export interface ThemeState {
  mode: ThemeMode;
  accent: string;
  background: string;
  /** Своя картинка фоном, data-URL. Пусто — используется пресет. */
  customImage: string;
  /** Тон и насыщенность, снятые с картинки. */
  customHue: number;
  customSat: number;
}

/**
 * Раскладывает тему по CSS-переменным корневого элемента.
 *
 * Вызывать при любом изменении темы. Дешёвая операция: 22 присваивания
 * переменных, перерисовку делает браузер.
 */
export const applyTheme = (t: ThemeState) => {
  const root = document.documentElement;

  root.classList.toggle('dark', t.mode === 'dark');

  setRamp(root, 'accent', getAccent(t.accent).ramp);

  const useCustom = !!t.customImage;
  const hue = useCustom ? t.customHue : getBackground(t.background).hue;
  const sat = useCustom ? t.customSat : getBackground(t.background).sat;
  setRamp(root, 'surface', buildSurfaceRamp(hue, sat));

  // Подложка окна. Своя картинка идёт под затемняющий слой: без него белый
  // текст на светлом снимке нечитаем, а панели теряют границы.
  if (t.customImage) {
    // Плотность подобрана так, чтобы картинку было видно, но панели поверх
    // неё читались. Панели сами полупрозрачные, поэтому снимок проступает и
    // сквозь них — на глухом затемнении в 0.82 он пропадал целиком.
    const scrim = t.mode === 'dark'
      ? 'linear-gradient(rgba(2, 6, 23, 0.68), rgba(2, 6, 23, 0.68))'
      : 'linear-gradient(rgba(248, 250, 252, 0.8), rgba(248, 250, 252, 0.8))';
    root.style.setProperty('--app-bg-image', `${scrim}, url("${t.customImage}")`);
  } else {
    root.style.setProperty('--app-bg-image', 'none');
  }
};

/**
 * Средний цвет картинки — тон и насыщенность для подстройки интерфейса.
 *
 * Считается по уменьшенной до 32x32 копии: полный размер здесь не нужен,
 * а мелкая копия усредняет сама по себе. Тёмные и почти серые пиксели тон
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
        if (!ctx) return resolve({ hue: 217, sat: 1 });
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

        if (count === 0) return resolve({ hue: 217, sat: 0 });

        let hue = (Math.atan2(y, x) * 180) / Math.PI;
        if (hue < 0) hue += 360;

        // Насыщенность картинки переводим в множитель для поверхностей.
        // Потолок 1.6: выше панели начинают спорить с акцентом за внимание.
        const sat = Math.min((satSum / count) * 2.2, 1.6);
        resolve({ hue: Math.round(hue), sat: Math.round(sat * 100) / 100 });
      } catch {
        resolve({ hue: 217, sat: 1 });
      }
    };
    img.onerror = () => resolve({ hue: 217, sat: 1 });
    img.src = dataUrl;
  });

/**
 * Ужимает выбранный файл до пригодного для хранения размера.
 *
 * Картинку приходится держать в localStorage — у него на всё про всё около
 * пяти мегабайт, а снимок с телефона легко весит больше. Ужимаем до 1600 px
 * по длинной стороне и пишем в JPEG.
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
