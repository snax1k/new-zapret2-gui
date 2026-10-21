/**
 * Имитация нативной части — только для разработки интерфейса.
 *
 * Включается в `npm run dev` параметром `?mock` в адресе. В сборку не
 * попадает: подключение стоит за `import.meta.env.DEV`, и в релизе эта
 * ветка вырезается целиком вместе с самим модулем.
 *
 * Зачем. Мастер первого запуска, подбор и мост живут в основном в
 * нативной части, а без неё интерфейс в браузере показывает только
 * пустые экраны. Имитация отвечает на те же сообщения, что и программа,
 * и позволяет пройти мастер целиком глазами — со скриншотами каждого
 * шага — до того, как собирать exe.
 *
 * Сценарий выбирается значением параметра:
 *   ?mock          — обычный: прокси включён, Discord находит multidisorder,
 *                    YouTube — seqovl 681;
 *   ?mock=clean    — окружение чистое;
 *   ?mock=partial  — лучший вариант проходит через раз;
 *   ?mock=none     — не помогает ничего;
 *   ?mock=free     — блокировки нет, всё открывается без обхода;
 *   ?mock=rival    — запущен другой обходчик;
 *   ?mock=address  — первый адрес цели молчит при любом обходе, подбор
 *                    меняет адрес и находит вариант со второго круга;
 *   ?mock=crash    — через 4 с после включения ядро «падает», ждёт
 *                    перезапуска 3 с и поднимается снова;
 *   ?mock=moved    — автозапуск включён, но открывает другой файл программы;
 *   ?mock=lists    — в репозитории есть списки сайтов новее встроенных;
 *   ?mock=offline  — GitHub недоступен, проверка списков падает.
 *
 * Скорость: вариант проверяется за ~0,7-1,2 с вместо 4-13 с в жизни.
 */
type Handler = (e: { data: string }) => void;

export function installMockHost(): void {
  const scenario = new URLSearchParams(location.search).get('mock') || 'default';
  const handlers = new Set<Handler>();
  const send = (obj: unknown) =>
    setTimeout(() => handlers.forEach(h => h({ data: JSON.stringify(obj) })), 0);

  let tgRunning = false;
  let tuneCancelled = false;
  let tuneRound = 0;
  let timestamps = scenario === 'clean';

  const preflight = () => {
    const items: { id: string; level: string; title: string; detail: string; action?: string; actionLabel?: string }[] = [];
    if (scenario === 'clean' || scenario === 'rival') {
      items.push({ id: 'proxy', level: 'ok', title: 'Системный прокси выключен', detail: 'Трафик идёт напрямую — обход может его обработать.' });
    } else {
      items.push({
        id: 'proxy', level: 'warn', title: 'Включён системный прокси: 127.0.0.1:10809',
        detail: 'HTTP(S) приложений уходит на прокси через loopback, обход такой трафик не видит. UDP (голос Discord, QUIC) идёт мимо прокси и обрабатывается.'
      });
      items.push({
        id: 'discord_proxy', level: 'error', title: 'Discord ходит через прокси, а не через обход',
        detail: 'Соединений Discord с прокси 127.0.0.1:10809: 3. Загрузка, сообщения и картинки идут через него, и никакая стратегия на них не влияет.'
      });
    }
    items.push(timestamps
      ? { id: 'tcpts', level: 'ok', title: 'Метки времени TCP включены', detail: 'Способы обхода с пометкой ts будут работать.' }
      : {
          id: 'tcpts', level: 'warn', title: 'Метки времени TCP выключены',
          detail: 'Часть способов обхода (с пометкой ts) без них не работает.',
          action: 'enable_tcp_timestamps', actionLabel: 'Включить'
        });
    if (scenario === 'rival') {
      items.push({
        id: 'rivals', level: 'error', title: 'Запущен другой обходчик DPI: goodbyedpi',
        detail: 'Он занимает драйвер WinDivert. Одновременная работа двух обходчиков приводит к разрыву соединений.'
      });
    }
    send({ type: 'preflight', items });
    // Нативная часть шлёт маршрут вместе с проверкой — по нему, в частности,
    // срабатывает включение обхода при запуске.
    send({ type: 'net_route', ifIdx: 7, name: 'Ethernet', isTunnel: false, physIfIdx: 7, physName: 'Ethernet' });
  };

  /**
   * Проходит ли вариант: screen — быстрый отсев (одна попытка на цель),
   * иначе — полная проверка. В сценарии partial multidisorder проходит
   * отсев, но срывается на полной проверке.
   */
  const passes = (group: 'sites' | 'youtube', id: string, screen: boolean): boolean => {
    if (scenario === 'free') return true;
    if (scenario === 'address' && tuneRound === 0) return false;
    if (id === 'off' || scenario === 'none') return false;
    if (scenario === 'partial') return id === 'multidisorder' && screen;
    if (id === 'combo') return true;
    // Несколько вариантов проходят отсев, но держит полную проверку один —
    // так видно, как финалисты отсеиваются.
    const winner = group === 'sites' ? 'multidisorder' : 'seqovl681';
    const lucky = group === 'sites' ? ['seqovl681', 'fake-md5sig'] : ['seqovl568'];
    if (id === 'seqovl568-ru') return true;
    return id === winner || (screen && lucky.includes(id));
  };

  const autotune = (payload: string) => {
    const [, hosts, body] = payload.split('\x1f');
    const targets = (hosts || '').split(',').filter(Boolean).length || 1;
    const group: 'sites' | 'youtube' = /youtube/.test(hosts || '') && !/discord/.test(hosts || '') ? 'youtube' : 'sites';
    const ids = (body || '').split('\x1e').map(v => v.split('|')[0]).filter(Boolean);
    const order = [...ids.filter(id => id === 'off'), ...ids.filter(id => id !== 'off')];
    const FINALISTS = 4;
    tuneCancelled = false;
    tuneRound = 0;

    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

    /** Один вариант: шаги и результат. Возвращает, прошёл ли. */
    const test = async (id: string, attempts: number, screen: boolean, report: boolean) => {
      send({ type: 'autotune_step', id, phase: 'starting' });
      await wait(300);
      send({ type: 'autotune_step', id, phase: 'testing' });
      await wait(screen ? 400 : 900);
      let ok = passes(group, id, screen);
      const total = targets * attempts;
      const passed = ok ? total : scenario === 'partial' && id === 'multidisorder' ? total - 2 : 0;
      let detail = ok ? '' : (id === 'combo' ? 'www.youtube.com: 1 из 3' : 'discord.com: 0 из ' + attempts);
      // Полная проверка заканчивается браузером. seqovl568-ru показывает
      // заморозку: рукопожатие проходит, страница — нет.
      if (ok && !screen && id !== 'off') {
        send({ type: 'autotune_step', id, phase: 'browser' });
        await wait(800);
        if (id === 'seqovl568-ru') {
          ok = false;
          detail = 'браузер: страница начала грузиться, но не догрузилась за 12 с (31840 символов) — похоже на заморозку соединения';
        } else {
          detail = 'браузер: открылось за 1940 мс';
        }
      }
      if (report || !ok) {
        send({ type: 'autotune_result', id, ok, passed, total, ms: ok ? 3900 : 6200, detail });
      }
      return ok;
    };

    const round = async (): Promise<'winner' | 'free' | 'cancel' | 'exhausted'> => {
      let next = 0;
      while (next < order.length) {
        const finalists: string[] = [];
        for (; next < order.length && finalists.length < FINALISTS; next++) {
          if (tuneCancelled) return 'cancel';
          const id = order[next];
          if (id === 'off') {
            if (await test(id, 3, false, true)) return 'free';
            continue;
          }
          if (await test(id, 1, true, false)) {
            finalists.push(id);
            send({ type: 'autotune_step', id, phase: 'finalist' });
          }
        }
        let winner = false;
        for (const id of finalists) {
          if (tuneCancelled) return 'cancel';
          if (await test(id, 3, false, true)) winner = true;
        }
        if (winner) {
          for (let k = next; k < order.length; k++) send({ type: 'autotune_step', id: order[k], phase: 'skipped' });
          return 'winner';
        }
      }
      return 'exhausted';
    };

    (async () => {
      let r = await round();
      if (r === 'exhausted' && scenario === 'address' && !tuneCancelled) {
        tuneRound = 1;
        send({ type: 'autotune_round', round: 1 });
        r = await round();
      }
      send({ type: 'autotune_done' });
    })();
  };

  // Автозапуск: состояние задачи Планировщика.
  let autostartOn = scenario === 'moved';
  const autostartState = (error = '') => send({
    type: 'autostart', enabled: autostartOn,
    current: scenario !== 'moved',
    path: autostartOn ? String.raw`C:\Users\user\Downloads\Zapret2-GUI-v0.4.4-portable.exe` : '',
    error
  });

  // Ядро: в сценарии crash падает и поднимается заново, как в нативной части.
  let engineTimers: number[] = [];
  const clearEngine = () => { engineTimers.forEach(t => clearTimeout(t)); engineTimers = []; };
  const log = (level: string, message: string, source: string) =>
    send({ type: 'log', level, message, source, timestamp: new Date().toTimeString().split(' ')[0] });
  const startEngine = () => {
    clearEngine();
    engineTimers.push(window.setTimeout(() => send({ type: 'status_change', status: 'connected', pid: 4242 }), 500));
    if (scenario !== 'crash') return;
    engineTimers.push(window.setTimeout(() => {
      log('error', 'Ядро winws.exe неожиданно завершилось (код 3221225477, проработало 4 с).', 'Core');
      log('warn', 'Перезапуск ядра через 3 с — попытка 1 из 5.', 'Watchdog');
      send({ type: 'status_change', status: 'restarting', pid: 0, delay: 3, attempt: 1, max: 5 });
    }, 4500));
    engineTimers.push(window.setTimeout(() => {
      log('success', 'Ядро перезапущено — обход снова работает.', 'Watchdog');
      send({ type: 'status_change', status: 'connected', pid: 4243 });
    }, 7500));
  };

  // Списки сайтов: встроенная версия 1, в репозитории — 2 (сценарий lists).
  let lists = { version: 1, updated: '2026-10-15', source: 'builtin', domains: 103 };
  const listsInfo = (result = '', error = '') =>
    send({ type: 'lists_info', ...lists, builtinVersion: 1, result, error });
  const listsCheck = (manual: boolean) => setTimeout(() => {
    if (scenario === 'offline') {
      listsInfo('error', 'нет связи с GitHub (Невозможно разрешить удалённое имя)');
      return;
    }
    if (scenario === 'lists' && lists.version === 1) {
      lists = { version: 2, updated: '2026-10-20', source: 'update', domains: 109 };
      log('success', 'Списки сайтов обновлены: версия 2 от 2026-10-20 (была 1). Ядро подхватит их само, перезапуск не нужен.', 'Lists');
      listsInfo('updated');
      return;
    }
    if (manual) log('info', `Списки сайтов актуальны: версия ${lists.version}.`, 'Lists');
    listsInfo('up_to_date');
  }, 900);

  const tgStatus = () => send({
    type: 'tg_status', running: tgRunning, host: '127.0.0.1', port: 1443, linkHost: '127.0.0.1', error: '',
    stats: { total: 0, active: 0, bad: 0, ws: 0, cf: 0, tcp: 0, failed: 0, bytesUp: 0, bytesDown: 0 }
  });

  const onMessage = (raw: string) => {
    if (raw === 'run_preflight') preflight();
    else if (raw === 'enable_tcp_timestamps') { timestamps = true; setTimeout(preflight, 400); }
    else if (raw === 'kill_stale_winws') {
      send({ type: 'stale_winws_done', pids: [], killedPids: [], ownPid: 0, error: '' });
      preflight();
    }
    else if (raw.startsWith('autotune:')) autotune(raw.slice('autotune:'.length));
    else if (raw === 'autotune_cancel') tuneCancelled = true;
    else if (raw.startsWith('tg_start:')) { setTimeout(() => { tgRunning = true; tgStatus(); }, 700); }
    else if (raw === 'tg_stop') { tgRunning = false; tgStatus(); }
    else if (raw === 'tg_status') tgStatus();
    else if (raw.startsWith('tg_open:')) console.info('[mock] Telegram открыл бы ссылку:', raw.slice(8));
    else if (raw.startsWith('start_engine:')) startEngine();
    else if (raw === 'stop_engine') { clearEngine(); setTimeout(() => send({ type: 'status_change', status: 'disconnected', pid: 0 }), 300); }
    else if (raw === 'autostart_get') setTimeout(() => autostartState(), 200);
    else if (raw === 'lists_info') setTimeout(() => listsInfo(), 150);
    else if (raw.startsWith('lists_check:')) listsCheck(raw.endsWith('manual'));
    else if (raw === 'lists_reset') setTimeout(() => {
      lists = { version: 1, updated: '2026-10-15', source: 'builtin', domains: 103 };
      log('info', 'Списки сайтов возвращены к встроенным в программу.', 'Lists');
      listsInfo('reset');
    }, 400);
    else if (raw.startsWith('autostart_set:')) {
      setTimeout(() => { autostartOn = raw.endsWith('1'); autostartState(); }, 500);
    }
    else if (raw.startsWith('open_url:')) console.info('[mock] Открыл бы адрес:', raw.slice(9));
  };

  (window as any).chrome = {
    webview: {
      postMessage: (m: unknown) => onMessage(String(m)),
      addEventListener: (_: string, h: Handler) => { handlers.add(h); },
      removeEventListener: (_: string, h: Handler) => { handlers.delete(h); }
    }
  };
  console.info(`[mock] Имитация нативной части, сценарий «${scenario}»`);
}
