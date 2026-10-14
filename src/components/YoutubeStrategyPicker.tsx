import React from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { strategiesFor, findYoutubeStrategy, STRATEGY_ORDER } from '../lib/zapretCommand';
import { plainStrategy } from '../lib/autotune';
import { StrategyGroup } from '../types';
import { Button, StatusDot, plural } from './ui';

interface Props {
  /** Какой профиль настраивается. По умолчанию YouTube/Google. */
  group?: StrategyGroup;
}

/**
 * Выбор способа обхода для одной группы профилей.
 *
 * Групп две: YouTube/Google (TCP 443, list-google.txt) и «Discord и сайты» —
 * профиль сайтов из списков вместе с медиасерверами Discord. У одного и того
 * же провайдера они могут требовать разных техник, поэтому подбираются
 * отдельно.
 *
 * Точка на чипе — что сказал последний подбор: зелёная — прошёл, красная —
 * не прошёл, без точки — не проверялся. Ради этого и сделано: 2026-10-12 у
 * Discord стоял вручную выбранный непроверенный способ, и клиент
 * открывался через раз.
 */
export const YoutubeStrategyPicker: React.FC<Props> = ({ group = 'youtube' }) => {
  const {
    quickToggles, setYoutubeStrategy, setSitesStrategy,
    setIsAutotuneModalOpen, setAutotuneGroup, setAutotuneTab, isAutotuneRunning, tuneVerdicts
  } = useApp();
  const verdicts = tuneVerdicts[group] || {};
  const anyVerdicts = Object.keys(verdicts).length > 0;

  const isYoutube = group === 'youtube';
  const active = findYoutubeStrategy(isYoutube ? quickToggles.youtubeStrategy : quickToggles.sitesStrategy);
  const setStrategy = isYoutube ? setYoutubeStrategy : setSitesStrategy;
  const count = STRATEGY_ORDER[group].filter(id => id !== 'off').length;
  const title = `${isYoutube ? 'YouTube и Google' : 'Discord и сайты'} (${count} ${plural(count, ['способ', 'способа', 'способов'])})`;
  const subtitle = isYoutube
    ? 'Профиль TCP 443 со списком list-google.txt'
    : 'Профиль сайтов из списков и медиасерверов Discord — discord.com, шлюз, картинки, голосовые серверы';

  const plain = plainStrategy(active.id);

  return (
    <div className="rounded-[12px] p-3.5 space-y-2.5 bg-s1 border border-line select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-t1">{title}</div>
          <div className="text-[11px] text-t2">{subtitle}</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Sparkles}
          onClick={() => { setAutotuneGroup(group); setAutotuneTab(group); setIsAutotuneModalOpen(true); }}
        >
          {isAutotuneRunning ? 'Идёт подбор…' : 'Подобрать автоматически'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {strategiesFor(group).map(s => {
          const isActive = s.id === active.id;
          const verdict = verdicts[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStrategy(s.id)}
              title={s.hint + (verdict === 'ok' ? ' — последний подбор: работает.' : verdict === 'fail' ? ' — последний подбор: не прошёл.' : '')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] font-medium border transition-colors ${
                isActive ? 'bg-ac/15 border-ac text-white' : 'bg-s2 border-line text-t2 hover:text-t1 hover:border-line-strong'
              }`}
            >
              {verdict && <StatusDot status={verdict === 'ok' ? 'ok' : 'bad'} size={6} />}
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-2.5 py-2 rounded-[8px] bg-s2 border border-line flex items-start justify-between gap-3 text-[12px]">
        <div className="min-w-0 space-y-0.5">
          <div className="text-t1">{plain || active.hint}</div>
          {plain && <div className="text-[11px] text-t3">{active.hint}</div>}
        </div>
        {active.id !== 'off' && verdicts[active.id] === 'fail' && (
          <span className="px-2 py-0.5 rounded text-[11px] shrink-0 bg-red-500/[0.12] text-red-300">
            Последний подбор этот способ отбраковал
          </span>
        )}
        {active.id !== 'off' && anyVerdicts && !verdicts[active.id] && (
          <span className="px-2 py-0.5 rounded text-[11px] shrink-0 bg-amber-500/[0.12] text-amber-300 max-w-[48%]">
            Этот способ подбор не проверял — надёжнее выбрать отмеченный зелёным
          </span>
        )}
      </div>

      <div className="text-[11px] text-t3 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5"><StatusDot status="ok" size={6} /> прошёл последний подбор</span>
        <span className="inline-flex items-center gap-1.5"><StatusDot status="bad" size={6} /> не прошёл</span>
        <span>без точки — не проверялся</span>
      </div>
    </div>
  );
};
