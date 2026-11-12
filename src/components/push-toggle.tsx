"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { disablePush, enablePush, pushOn, pushSupported, type PushResult } from "@/lib/client/push";
import { cx } from "@/lib/format";

const PROBLEM: Record<Exclude<PushResult, "on">, string> = {
  denied: "Сповіщення заборонені для цього застосунку. Дозвольте їх у налаштуваннях телефона й спробуйте ще раз.",
  unsupported: "Тут сповіщення недоступні. На iPhone вони працюють лише у встановленому застосунку (Поділитися → «На екран “Додому”»).",
  error: "Не вдалося ввімкнути. Перевірте звʼязок і спробуйте ще раз.",
};

/** Reads the state after mount — it depends on this device, so the server cannot know it. */
function usePushState() {
  const [state, setState] = useState<{ ready: boolean; supported: boolean; on: boolean }>({ ready: false, supported: false, on: false });
  useEffect(() => {
    void Promise.resolve().then(() => setState({ ready: true, supported: pushSupported(), on: pushOn() }));
  }, []);
  return [state, setState] as const;
}

/** Settings: turn notifications on or off on this device. */
export function PushToggle() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    if (state.on) {
      await disablePush();
      setState({ ...state, on: false });
    } else {
      const r = await enablePush();
      if (r === "on") setState({ ...state, on: true });
      else setProblem(PROBLEM[r]);
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Коли відпочинок між підходами закінчується, а телефон заблокований або відкрито інший застосунок, прийде сповіщення зі звуком. Вмикається
        окремо на кожному пристрої.
      </p>
      <button onClick={() => void toggle()} disabled={busy || !state.ready} className={cx("btn", state.on ? "btn-ghost" : "btn-primary")}>
        {state.on ? <BellOff size={17} /> : <Bell size={17} />}
        {busy ? "Зачекайте…" : state.on ? "Вимкнути на цьому пристрої" : "Увімкнути сповіщення"}
      </button>
      {state.on && <p className="text-xs text-good">Увімкнено на цьому пристрої.</p>}
      {state.ready && !state.supported && !problem && <p className="text-xs text-muted">{PROBLEM.unsupported}</p>}
      {problem && (
        <p role="alert" className="text-sm text-critical">
          {problem}
        </p>
      )}
    </div>
  );
}

/** On the rest screen: a bell that turns the locked-screen signal on right where it is needed. */
export function PushBell() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!state.ready || !state.supported) return null;
  if (state.on)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <BellRing size={14} className="text-accent" /> Сигнал прийде й на заблокований екран
      </span>
    );
  return (
    <span className="flex flex-col items-center gap-1.5">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await enablePush();
          if (r === "on") setState({ ...state, on: true });
          else setProblem(PROBLEM[r]);
          setBusy(false);
        }}
        className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink"
      >
        <Bell size={14} /> {busy ? "Вмикаю…" : "Сигнал на заблокованому екрані"}
      </button>
      {problem && <span className="max-w-[18rem] text-center text-[11px] leading-tight text-critical">{problem}</span>}
    </span>
  );
}
