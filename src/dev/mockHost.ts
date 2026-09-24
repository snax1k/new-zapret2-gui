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
 *   ?mock=rival    — запущен другой обходчик.
 *
 * Скорость: вариант проверяется за ~1,3 с вместо 4-13 с в жизни.
 */
type Handler = (e: { data: string }) => void;

export function installMockHost(): void {
  const scenario = new URLSearchParams(location.search).get('mock') || 'default';
  const handlers = new Set<Handler>();
  const send = (obj: unknown) =>
    setTimeout(() => handlers.forEach(h => h({ data: JSON.stringify(obj) })), 0);

  let tgRunning = false;
  let tuneCancelled = false;

  const preflight = () => {
    const items: { id: string; level: string; title: string; detail: string }[] = [];
    if (scenario === 'clean' || scenario === 'rival') {
      items.push({ id: 'proxy', level: 'ok', title: 'Системный прокси выключен', detail: 'Трафик идёт напрямую — обход может его обработать.' });
    } else {
      items.push({
        id: 'proxy', level: 'warn', title: 'Включён системный прокси: 127.0.0.1:10809',
        detail: 'HTTP(S) приложений уходит на прокси через loopback, обход такой трафик не видит. UDP (голос Discord, QUIC) идёт мимо прокси и обрабатывается.'
      });
    }
    if (scenario === 'rival') {
      items.push({
        id: 'rivals', level: 'error', title: 'Запущен другой обходчик DPI: goodbyedpi',
        detail: 'Он занимает драйвер WinDivert. Одновременная работа двух обходчиков приводит к разрыву соединений.'
      });
    }
    send({ type: 'preflight', items });
  };

  /** Какой исход у варианта в текущем сценарии. */
  const verdict = (group: 'sites' | 'youtube', id: string): { ok: boolean; passed: number } => {
    if (scenario === 'free') return { ok: true, passed: 9 };
    if (id === 'off' || scenario === 'none') return { ok: false, passed: 0 };
    if (scenario === 'partial') return id === 'multidisorder' ? { ok: false, passed: 6 } : { ok: false, passed: 0 };
    const winner = group === 'sites' ? 'multidisorder' : 'seqovl681';
    return id === winner ? { ok: true, passed: group === 'sites' ? 9 : 6 } : { ok: false, passed: 0 };
  };

  const autotune = (payload: string) => {
    const [, hosts, body] = payload.split('\x1f');
    const group: 'sites' | 'youtube' = /youtube/.test(hosts || '') ? 'youtube' : 'sites';
    const ids = (body || '').split('\x1e').map(v => v.split('|')[0]).filter(Boolean);
    const order = ['off', ...ids.filter(id => id !== 'off')];
    const total = group === 'sites' ? 9 : 6;
    tuneCancelled = false;

    let i = 0;
    const next = () => {
      if (tuneCancelled || i >= order.length) { send({ type: 'autotune_done' }); return; }
      const id = order[i];
      send({ type: 'autotune_step', id, phase: 'starting' });
      setTimeout(() => {
        send({ type: 'autotune_step', id, phase: 'testing' });
        setTimeout(() => {
          if (tuneCancelled) { send({ type: 'autotune_done' }); return; }
          const v = verdict(group, id);
          send({
            type: 'autotune_result', id, ok: v.ok, passed: v.passed, total,
            ms: v.ok ? 3900 : 12600, detail: v.ok ? '' : 'discord.com: 0 из 3'
          });
          i++;
          // Эталон прошёл — блокировки нет, дальше не перебираем.
          if (id === 'off' && v.ok) { send({ type: 'autotune_done' }); return; }
          next();
        }, 900);
      }, 400);
    };
    next();
  };

  const tgStatus = () => send({
    type: 'tg_status', running: tgRunning, host: '127.0.0.1', port: 1443, linkHost: '127.0.0.1', error: '',
    stats: { total: 0, active: 0, bad: 0, ws: 0, cf: 0, tcp: 0, failed: 0, bytesUp: 0, bytesDown: 0 }
  });

  const onMessage = (raw: string) => {
    if (raw === 'run_preflight') preflight();
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
    else if (raw.startsWith('start_engine:')) setTimeout(() => send({ type: 'status_change', status: 'connected', pid: 4242 }), 500);
    else if (raw === 'stop_engine') setTimeout(() => send({ type: 'status_change', status: 'disconnected', pid: 0 }), 300);
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
