import React, { useState } from 'react';
import {
  Send,
  Power,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  Wifi,
  Network,
  ShieldAlert,
  Info,
  ArrowUp,
  ArrowDown,
  Cloud,
  Link2,
  Loader2
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const formatBytes = (n: number): string => {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' ГБ';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' МБ';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' КБ';
  return n + ' Б';
};

/** Переключатель-строка: подпись, пояснение и сам тумблер справа. */
const SettingRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}> = ({ icon: Icon, title, hint, checked, onChange, danger }) => (
  <button
    onClick={() => onChange(!checked)}
    className="w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
  >
    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
      checked
        ? danger
          ? 'bg-amber-500/15 text-amber-500'
          : 'bg-indigo-500/15 text-indigo-500'
        : 'bg-black/5 dark:bg-white/5 text-slate-400'
    }`}>
      <Icon className="w-3.5 h-3.5" />
    </div>

    <div className="flex-1 min-w-0">
      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{hint}</p>
    </div>

    <div className={`w-9 h-5 rounded-full shrink-0 relative transition-colors mt-0.5 ${
      checked ? (danger ? 'bg-amber-500' : 'bg-indigo-600') : 'bg-slate-300 dark:bg-slate-700'
    }`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
        checked ? 'left-[18px]' : 'left-0.5'
      }`} />
    </div>
  </button>
);

export const TgProxyView: React.FC = () => {
  const {
    theme,
    tgProxy,
    tgSettings,
    setTgSettings,
    startTgProxy,
    stopTgProxy,
    regenerateTgSecret,
    tgLink,
    openTgLink
  } = useApp();

  const [copied, setCopied] = useState(false);
  const [portDraft, setPortDraft] = useState(String(tgSettings.port));
  const [secretShown, setSecretShown] = useState(false);

  const card = theme === 'dark'
    ? 'bg-slate-900/50 border-white/5'
    : 'bg-white border-slate-200 shadow-xs';

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
    ? tgSettings.secret.slice(0, 6) + '••••••••••••••••••••' + tgSettings.secret.slice(-6)
    : '';

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto select-none">
      {/* Заголовок */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Send className="w-5 h-5 text-indigo-500" />
          Телеграм — Прокси
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
          Встроенный мост для Telegram. Клиент подключается к нему на этой же машине,
          а мост выводит соединение наружу по WebSocket — транспортом веб-версии Telegram,
          а если адреса Telegram закрыты, то через запасной узел. К обходу DPI отношения
          не имеет и работает отдельно: ядро может быть выключено.
        </p>
      </div>

      {/* Состояние и выключатель */}
      <div className={`p-4 rounded-xl border flex items-center gap-4 ${card}`}>
        <button
          onClick={tgProxy.running ? stopTgProxy : startTgProxy}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all shrink-0 ${
            tgProxy.running
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500 shadow-glow-green'
              : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
          }`}
          title={tgProxy.running ? 'Остановить мост' : 'Запустить мост'}
        >
          <Power className="w-6 h-6" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold flex items-center gap-2">
            {tgProxy.running ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span>Мост работает</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                <span>Мост остановлен</span>
              </>
            )}
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {tgProxy.running
              ? <>Слушает <span className="font-mono text-slate-700 dark:text-slate-200">{tgProxy.host}:{tgProxy.port}</span>
                  {tgProxy.host === '0.0.0.0' && <> — доступен и другим устройствам в вашей сети</>}</>
              : <>Нажмите кнопку слева. Порт откроется только после запуска.</>}
          </div>

          {tgProxy.error && (
            <div className="mt-2 text-[11px] text-rose-500 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>Не удалось запустить: {tgProxy.error}</span>
            </div>
          )}
        </div>

        {tgProxy.running && (
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Соединений сейчас</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{s.active}</div>
          </div>
        )}
      </div>

      {/* Ссылка подключения */}
      <div className={`p-4 rounded-xl border space-y-3 ${card}`}>
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold">Ссылка для подключения</span>
        </div>

        {tgProxy.running ? (
          <>
            <div className={`px-3 py-2.5 rounded-lg border font-mono text-[11px] break-all ${
              theme === 'dark'
                ? 'bg-black/40 border-white/10 text-indigo-300'
                : 'bg-slate-50 border-slate-300 text-indigo-700'
            }`}>
              {tgLink}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openTgLink}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Открыть в Telegram</span>
              </button>

              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-medium border border-black/5 dark:border-white/5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Кнопка отдаёт ссылку системе, её подхватывает установленный Telegram:
              он покажет окно добавления прокси и включит его. Если клиент не открылся —
              скопируйте ссылку и вставьте её в любой чат, ссылки такого вида Telegram
              обрабатывает сам.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 opacity-60" />
            <span>Ссылка появится после запуска моста — в ней указан адрес, которого пока нет.</span>
          </div>
        )}
      </div>

      {/* Настройки */}
      <div className={`p-4 rounded-xl border space-y-3 ${card}`}>
        <div className="text-xs font-bold">Настройки</div>

        {/* Порт */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-500 shrink-0">
            <Network className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Порт</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              На нём мост ждёт подключения от Telegram. Менять есть смысл, только
              если 1443 занят другой программой.
            </p>
          </div>
          <input
            type="number"
            min={1}
            max={65535}
            value={portDraft}
            onChange={(e) => setPortDraft(e.target.value)}
            onBlur={commitPort}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={`w-24 px-2.5 py-1.5 rounded-lg border text-xs font-mono text-center focus:outline-none focus:border-indigo-500 shrink-0 ${
              theme === 'dark'
                ? 'bg-black/40 border-white/10 text-slate-100'
                : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          />
        </div>

        {/* Секрет */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-500 shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Секрет</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              Отличает ваш мост от чужого: без него рукопожатие не проходит.
              Он уже внутри ссылки, отдельно вводить его не нужно.
            </p>
            <button
              onClick={() => setSecretShown(v => !v)}
              className="mt-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:text-indigo-500 transition-colors break-all text-left"
              title="Нажмите, чтобы показать или скрыть"
            >
              {secretShown ? tgSettings.secret : maskedSecret}
            </button>
          </div>
          <button
            onClick={regenerateTgSecret}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-black/5 dark:border-white/5 transition-colors shrink-0"
            title="Прежняя ссылка перестанет работать"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Сменить</span>
          </button>
        </div>

        <SettingRow
          icon={Power}
          title="Запускать вместе с программой"
          hint="Мост поднимется сам при старте. Порт при этом открывается без вашего участия, поэтому по умолчанию выключено."
          checked={tgSettings.autoStart}
          onChange={(v) => setTgSettings({ autoStart: v })}
        />

        <SettingRow
          icon={Wifi}
          title="Доступ из локальной сети"
          hint="Мост станет слушать все адреса, и по ссылке смогут подключиться телефон или второй компьютер в той же сети. Порт при этом виден всем соседям по сети — защищает только секрет."
          checked={tgSettings.lanAccess}
          onChange={(v) => setTgSettings({ lanAccess: v })}
          danger
        />

        <SettingRow
          icon={Network}
          title="Прямое соединение как резерв"
          hint="Если веб-транспорт не прошёл, мост попробует обычный MTProto прямо к дата-центру. Помогает там, где Telegram не заблокирован вовсе, и бесполезно там, где закрыты подсети."
          checked={tgSettings.allowDirectTcp}
          onChange={(v) => setTgSettings({ allowDirectTcp: v })}
        />

        <SettingRow
          icon={Cloud}
          title="Обход через запасные узлы"
          hint="Если адреса Telegram закрыты целиком — а закрывают обычно именно так, подсетями, — мост пойдёт через сторонний узел, который передаёт соединение дальше. На заблокированных сетях работает именно этот путь. Узел чужой: он видит ваш адрес и объём трафика, но не его содержимое — переписка зашифрована ключами самого Telegram."
          checked={tgSettings.allowCloudflare}
          onChange={(v) => setTgSettings({ allowCloudflare: v })}
        />

        <SettingRow
          icon={ShieldAlert}
          title="Повтор с чужим именем в TLS"
          hint="Если рукопожатие с именем kws*.web.telegram.org не проходит, мост повторит попытку, подставив в TLS постороннее имя. Настоящий адресат при этом не меняется. Помогает против фильтров, которые смотрят только на имя сайта."
          checked={tgSettings.allowFronting}
          onChange={(v) => setTgSettings({ allowFronting: v })}
        />
      </div>

      {/* Счётчики */}
      {tgProxy.running && (
        <div className={`p-4 rounded-xl border space-y-3 ${card}`}>
          <div className="text-xs font-bold">Что происходит</div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { label: 'Веб-транспорт', value: s.ws, tone: 'text-emerald-500' },
              { label: 'Запасной узел', value: s.cf, tone: 'text-indigo-500' },
              { label: 'Напрямую', value: s.tcp, tone: 'text-amber-500' },
              { label: 'Не прошло', value: s.failed, tone: s.failed > 0 ? 'text-rose-500' : 'text-slate-400' },
              { label: 'Отвергнуто', value: s.bad, tone: s.bad > 0 ? 'text-amber-500' : 'text-slate-400' }
            ].map(item => (
              <div key={item.label} className="p-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.label}</div>
                <div className={`text-lg font-bold leading-tight ${item.tone}`}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <span className="flex items-center gap-1.5">
              <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
              Отправлено: <span className="font-mono text-slate-700 dark:text-slate-200">{formatBytes(s.bytesUp)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
              Получено: <span className="font-mono text-slate-700 dark:text-slate-200">{formatBytes(s.bytesDown)}</span>
            </span>
            <span>Всего соединений: <span className="font-mono text-slate-700 dark:text-slate-200">{s.total}</span></span>
          </div>

          {s.ws === 0 && s.cf === 0 && s.tcp > 0 && (
            <p className="text-[11px] text-amber-500 leading-snug">
              Всё идёт напрямую, обход не понадобился. Значит дата-центры Telegram у вашего
              провайдера открыты и мост вам, скорее всего, не нужен.
            </p>
          )}
          {s.cf > 0 && (
            <p className="text-[11px] text-indigo-500 leading-snug">
              Соединения идут через запасной узел — прямые адреса Telegram у вас закрыты,
              и мост делает ровно ту работу, ради которой он здесь.
            </p>
          )}
          {s.failed > 0 && s.ws === 0 && s.cf === 0 && s.tcp === 0 && (
            <p className="text-[11px] text-rose-500 leading-snug">
              Ни одно соединение не дошло. Подробности — во вкладке «Консоль логов»,
              источник TgProxy: там видно, на каком шаге обрывается.
            </p>
          )}
        </div>
      )}

      {/* Пояснение */}
      <div className={`p-4 rounded-xl border space-y-2 ${card}`}>
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold">Почему Telegram лечится отдельно</span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          YouTube и Discord режут по содержимому: фильтр разбирает начало соединения и
          решает, пропускать ли его. Против этого и работает обход — он меняет форму
          первых пакетов. Telegram закрывают иначе: обрывают маршрут до подсетей
          дата-центров, и соединение не устанавливается вовсе. Резать нечего, поэтому
          профиль Telegram убран из ядра ещё в версии 0.1.5.
        </p>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Мост решает задачу с другой стороны: он принимает от клиента обычный MTProto
          и выводит его по WebSocket, как это делает веб-версия Telegram. Сами серверы
          веб-версии стоят в тех же закрытых подсетях, поэтому на заблокированной сети
          соединение идёт через запасной узел: у него чужой адрес, к которому претензий
          нет, и снаружи это выглядит как обычный заход на сайт.
        </p>
      </div>
    </div>
  );
};
