import React, { useState } from 'react';
import {
  Send, Power, Copy, Check, RefreshCw, KeyRound, Wifi, Network, ShieldAlert,
  ArrowUp, ArrowDown, Cloud, Play, Square, ExternalLink, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, Card, Note, StatusDot, SwitchRow } from '../components/ui';

const formatBytes = (n: number): string => {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' ГБ';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' МБ';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' КБ';
  return n + ' Б';
};

/**
 * Встроенный мост для Telegram.
 *
 * Клиент подключается к нему на этой же машине, а мост выводит соединение
 * наружу по WebSocket — транспортом веб-версии Telegram, а если адреса
 * Telegram закрыты, то через запасной узел. К обходу DPI отношения не имеет
 * и работает отдельно: ядро может быть выключено.
 */
export const TgProxyView: React.FC = () => {
  const {
    tgProxy, tgSettings, setTgSettings, startTgProxy, stopTgProxy,
    regenerateTgSecret, tgLink, openTgLink
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [portDraft, setPortDraft] = useState(String(tgSettings.port));
  const [secretShown, setSecretShown] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const copyLink = () => {
    if (!tgLink) return;
    navigator.clipboard.writeText(tgLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const commitPort = () => {
    const n = parseInt(portDraft, 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      setPortDraft(String(tgSettings.port));
      return;
    }
    if (n !== tgSettings.port) setTgSettings({ port: n });
    setPortDraft(String(n));
  };

  const s = tgProxy.stats;
  const maskedSecret = tgSettings.secret
    ? tgSettings.secret.slice(0, 6) + '••••••••••••••••' + tgSettings.secret.slice(-6)
    : '';

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3.5 select-none">
      {/* Состояние и выключатель */}
      <Card tone={tgProxy.running ? 'ok' : tgProxy.error ? 'bad' : 'default'} className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <StatusDot status={tgProxy.running ? 'ok' : tgProxy.error ? 'bad' : 'neutral'} pulse={tgProxy.running} size={10} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-t1 truncate">
                {tgProxy.running
                  ? <>Мост работает · слушает <span className="font-mono">{tgProxy.host}:{tgProxy.port}</span></>
                  : 'Мост остановлен'}
              </div>
              <div className="text-[12px] text-t2">
                {tgProxy.running
                  ? (tgProxy.host === '0.0.0.0'
                      ? 'Доступен и другим устройствам в вашей сети'
                      : 'Встроенный локальный мост для приложения Telegram')
                  : 'Порт откроется только после запуска. Обход DPI для моста не нужен.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {tgProxy.running && (
              <div className="text-right">
                <div className="text-[11px] text-t2">Соединений сейчас</div>
                <div className="text-[20px] font-semibold font-mono text-t1 leading-tight">{s.active}</div>
              </div>
            )}
            <Button
              variant={tgProxy.running ? 'danger' : 'primary'}
              icon={tgProxy.running ? Square : Play}
              onClick={tgProxy.running ? stopTgProxy : startTgProxy}
            >
              {tgProxy.running ? 'Остановить мост' : 'Запустить мост'}
            </Button>
          </div>
        </div>
        {tgProxy.error && (
          <Note tone="bad" icon={ShieldAlert}>Не удалось запустить: {tgProxy.error}</Note>
        )}
      </Card>

      {/* Ссылка подключения */}
      <Card className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-t1">Ссылка для подключения</span>
          {tgProxy.running && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copyLink}>
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
              <Button size="sm" icon={ExternalLink} onClick={openTgLink}>Открыть в Telegram</Button>
            </div>
          )}
        </div>
        {tgProxy.running ? (
          <>
            <div className="px-3 py-2 rounded-[8px] font-mono text-[12px] break-all select-text bg-s2 text-t2 border border-line">
              {tgLink}
            </div>
            <p className="text-[11px] text-t3 leading-snug">
              Кнопка отдаёт ссылку системе — её подхватит установленный Telegram и предложит включить прокси.
              Если клиент не открылся, скопируйте ссылку и вставьте в любой чат: такие ссылки Telegram обрабатывает сам.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-t2">
            <Loader2 className="w-3.5 h-3.5 opacity-60" />
            <span>Ссылка появится после запуска моста — в ней указан адрес, которого пока нет.</span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-12 gap-3.5">
        {/* Статистика */}
        <Card className="col-span-7 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-[12px] gap-2">
            <span className="font-semibold text-t1">Статистика</span>
            <span className="text-t2">
              Сейчас: <strong className="font-mono text-white">{s.active}</strong> · Всего: <strong className="font-mono text-white">{s.total}</strong>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: 'Веб-транспорт', value: s.ws, tone: s.ws > 0 ? 'text-green-400' : 'text-t1' },
              { label: 'Запасной узел', value: s.cf, tone: 'text-t1' },
              { label: 'Напрямую', value: s.tcp, tone: 'text-t1' },
              { label: 'Не прошло', value: s.failed, tone: s.failed > 0 ? 'text-red-400' : 'text-t1' },
              { label: 'Отвергнуто', value: s.bad, tone: s.bad > 0 ? 'text-amber-400' : 'text-t1' }
            ].map(item => (
              <div key={item.label} className="p-2 rounded-[8px] bg-s2 flex flex-col justify-between">
                <div className="text-[11px] text-t2 leading-tight">{item.label}</div>
                <div className={`text-[14px] font-mono font-semibold ${item.tone}`}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-t2">
            <span className="flex items-center gap-1.5"><ArrowUp className="w-3.5 h-3.5 text-ac" />Отправлено: <span className="font-mono text-t1">{formatBytes(s.bytesUp)}</span></span>
            <span className="flex items-center gap-1.5"><ArrowDown className="w-3.5 h-3.5 text-green-500" />Получено: <span className="font-mono text-t1">{formatBytes(s.bytesDown)}</span></span>
          </div>
          {tgProxy.running && s.ws === 0 && s.cf === 0 && s.tcp > 0 && (
            <Note tone="warn">Всё идёт напрямую, обход не понадобился: дата-центры Telegram у вашего провайдера открыты, и мост вам, скорее всего, не нужен.</Note>
          )}
          {tgProxy.running && s.cf > 0 && (
            <Note tone="accent">Соединения идут через запасной узел — прямые адреса Telegram у вас закрыты, и мост делает ровно ту работу, ради которой он здесь.</Note>
          )}
          {tgProxy.running && s.failed > 0 && s.ws === 0 && s.cf === 0 && s.tcp === 0 && (
            <Note tone="bad">Ни одно соединение не дошло. Подробности — в «Журнале», источник TgProxy: там видно, на каком шаге обрывается.</Note>
          )}
        </Card>

        {/* Пояснение */}
        <Card className="col-span-5 p-4 space-y-1.5">
          <div className="text-[13px] font-semibold text-t1">Почему Telegram лечится отдельно</div>
          <p className="text-[12px] leading-relaxed text-t2">
            YouTube и Discord режут по содержимому — против этого работает обход. Telegram закрывают по
            адресам: соединение с дата-центрами не устанавливается вовсе, резать нечего.
          </p>
          <p className="text-[12px] leading-relaxed text-t2">
            Мост принимает от клиента обычный MTProto и выводит его по WebSocket, как веб-версия Telegram,
            а на закрытой сети — через запасной узел с чужим адресом.
          </p>
        </Card>
      </div>

      {/* Настройки */}
      <Card className="p-3.5">
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between text-[13px] font-semibold text-t1"
        >
          <span>Настройки моста (порт {tgSettings.port}, секрет и режимы)</span>
          {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {settingsOpen && (
          <div className="mt-3 pt-3 space-y-2 border-t border-line">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-s2 border border-line">
                <div className="p-1.5 rounded-[7px] bg-ac/15 text-ac-300 shrink-0"><Network className="w-3.5 h-3.5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-t1">Порт</div>
                  <div className="text-[11px] text-t2 leading-snug">Менять, только если 1443 занят</div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={portDraft}
                  onChange={(e) => setPortDraft(e.target.value)}
                  onBlur={commitPort}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="ui-input w-24 px-2.5 py-1.5 text-[12px] font-mono text-center shrink-0"
                />
              </div>

              <div className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-s2 border border-line">
                <div className="p-1.5 rounded-[7px] bg-ac/15 text-ac-300 shrink-0"><KeyRound className="w-3.5 h-3.5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-t1">Секрет</div>
                  <button
                    type="button"
                    onClick={() => setSecretShown(v => !v)}
                    title="Показать или скрыть. Он уже внутри ссылки — отдельно вводить не нужно."
                    className="font-mono text-[11px] text-t2 hover:text-ac-300 break-all text-left"
                  >
                    {secretShown ? tgSettings.secret : maskedSecret}
                  </button>
                </div>
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={regenerateTgSecret} title="Прежняя ссылка перестанет работать">
                  Сменить
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SwitchRow
                icon={Power}
                title="Запускать вместе с программой"
                hint="Мост поднимется сам при старте. Порт при этом открывается без вашего участия."
                checked={tgSettings.autoStart}
                onChange={(v) => setTgSettings({ autoStart: v })}
              />
              <SwitchRow
                icon={Wifi}
                title="Доступ из локальной сети"
                hint="Подключатся телефон и другие устройства в сети. Порт виден всем соседям — защищает только секрет."
                checked={tgSettings.lanAccess}
                onChange={(v) => setTgSettings({ lanAccess: v })}
                warn
              />
              <SwitchRow
                icon={Cloud}
                title="Обход через запасные узлы"
                hint="Если адреса Telegram закрыты подсетями — а обычно так и есть. Узел видит ваш адрес и объём, но не содержимое: переписка зашифрована самим Telegram."
                checked={tgSettings.allowCloudflare}
                onChange={(v) => setTgSettings({ allowCloudflare: v })}
              />
              <SwitchRow
                icon={Network}
                title="Прямое соединение как резерв"
                hint="Обычный MTProto прямо к дата-центру, если веб-транспорт не прошёл. Помогает там, где Telegram не закрыт."
                checked={tgSettings.allowDirectTcp}
                onChange={(v) => setTgSettings({ allowDirectTcp: v })}
              />
              <SwitchRow
                icon={ShieldAlert}
                title="Повтор с чужим именем в TLS"
                hint="Если рукопожатие с kws*.web.telegram.org не проходит, мост повторит с посторонним именем. Адресат не меняется."
                checked={tgSettings.allowFronting}
                onChange={(v) => setTgSettings({ allowFronting: v })}
              />
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] border border-dashed border-line text-[11px] text-t3">
                <Send className="w-3.5 h-3.5 shrink-0" />
                Изменения применяются сразу: работающий мост перезапустится сам.
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
