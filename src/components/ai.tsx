"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Minus, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  analyzeWorkoutAction,
  coachNoteAction,
  periodReportAction,
  planProgramAction,
  planWorkoutAction,
  removeAiSettingsAction,
  saveAiSettingsAction,
  testAiAction,
  unreviewedWorkoutsAction,
} from "@/lib/ai-actions";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiNote, type AiProvider, type AiResult, type AiState } from "@/lib/ai-providers";
import { addDays, cx, dayOf, fmtDate, fmtTime } from "@/lib/format";

// ───────────────────────── Settings ─────────────────────────

/** Connects an AI provider with the user's own API key. */
export function AiSettings({ state }: { state: AiState }) {
  const router = useRouter();
  const [provider, setProvider] = useState<AiProvider>(state?.provider ?? "anthropic");
  const [model, setModel] = useState(state?.model ?? AI_PROVIDERS.anthropic.model);
  const [apiKey, setApiKey] = useState("");
  const [auto, setAuto] = useState(state?.auto ?? true);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const info = AI_PROVIDERS[provider];
  const connectedHere = state?.provider === provider;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const saved = await saveAiSettingsAction({ provider, model, apiKey: apiKey || undefined, auto });
          if (!saved.ok) return setMsg({ tone: "bad", text: saved.error });
          setApiKey("");
          router.refresh();
          // Check straight away, so a wrong key or model name shows up here and not later in the gym.
          const test = await testAiAction();
          setMsg(test.ok ? { tone: "good", text: `Підключено. ${test.model}: «${test.reply}»` } : { tone: "bad", text: `Збережено, але перевірка не пройшла: ${test.error}` });
        });
      }}
    >
      <p className="text-sm text-ink-2">
        Підключіть власний API-ключ — і застосунок сам аналізуватиме кожне завершене тренування (разом із пульсом з Apple Watch), щодня
        даватиме пораду на головній, складе тренування чи програму на тиждень, перезбере вже запланований день і напише звіт за період.
        Він завжди бере до уваги ваші цілі, вагу й показники та минулі тренування. Без ключа ці функції вимкнені.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Провайдер</span>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as AiProvider;
              setProvider(p);
              setModel(state?.provider === p ? state.model : AI_PROVIDERS[p].model);
            }}
            className="field"
          >
            {AI_PROVIDER_IDS.map((p) => (
              <option key={p} value={p}>
                {AI_PROVIDERS[p].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Модель</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.model} className="field font-mono text-sm" spellCheck={false} autoCapitalize="off" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">Назву моделі можна змінити на будь-яку, доступну вашому ключу — після збереження зʼєднання перевіряється автоматично.</p>
      <label className="block space-y-1.5">
        <span className="flex items-baseline justify-between gap-2 text-sm text-ink-2">
          API-ключ
          <a href={info.keysUrl} target="_blank" rel="noreferrer" className="text-xs text-accent">
            Де взяти ключ →
          </a>
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={connectedHere ? `Збережено ····${state!.hint} — введіть новий, щоб замінити` : "Вставте ключ"}
          autoComplete="off"
          className="field font-mono text-sm"
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5 size-5 accent-[var(--accent)]" />
        <span>
          Автоматично
          <span className="block text-xs text-muted">Аналіз одразу після тренування та порада дня на головній. Якщо вимкнути — лише на вашу кнопку.</span>
        </span>
      </label>
      {msg && (
        <p role="status" className={cx("rounded-xl px-3 py-2 text-sm", msg.tone === "good" ? "bg-good/15 text-good" : "bg-critical/15 text-critical")}>
          {msg.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || (!apiKey && !connectedHere)} className="btn btn-primary">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {state ? "Зберегти й перевірити" : "Підключити"}
        </button>
        {state && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              window.confirm("Відключити ШІ? Ключ буде видалено, готові аналізи залишаться.") &&
              start(async () => {
                await removeAiSettingsAction();
                setMsg(null);
                router.refresh();
              })
            }
            className="btn btn-danger"
          >
            Відключити
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Ключ зберігається на сервері зашифрованим і ніколи не показується знову. Запити оплачуються з вашого акаунта в провайдера; моделі
        надсилаються ваші тренування, цілі та вага тіла.
      </p>
    </form>
  );
}

// ───────────────────────── Notes ─────────────────────────

function NoteCard({
  title,
  initial,
  auto,
  ready = true,
  idle,
  action = "Проаналізувати",
  foldKey,
  run,
}: {
  title: string;
  /** When set, the card can be folded to one line; the choice is remembered on this device under this key. */
  foldKey?: string;
  /** label of the button that starts the first run */
  action?: string;
  initial: AiNote | null;
  auto: boolean;
  /** false while the data the note depends on is still being saved */
  ready?: boolean;
  idle: string;
  run: (force: boolean) => Promise<AiResult<{ note: AiNote }>>;
}) {
  const [note, setNote] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setError(null);
      const r = await run(force);
      if (r.ok) setNote(r.note);
      else setError(r.error);
      setBusy(false);
    },
    [run],
  );

  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!foldKey) return;
    void Promise.resolve().then(() => {
      try {
        setFolded(localStorage.getItem(foldKey) === "1");
      } catch {
        /* storage blocked — stay open */
      }
    });
  }, [foldKey]);
  const fold = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem(foldKey!, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (note || !auto || !ready || started.current) return;
    started.current = true;
    void Promise.resolve().then(() => load(false));
  }, [note, auto, ready, load]);

  return (
    <section className="card p-4">
      <div className={cx("flex items-center justify-between gap-2", !folded && "mb-2")}>
        {foldKey ? (
          <button onClick={() => fold(!folded)} aria-expanded={!folded} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[15px] font-semibold text-body">
            <Sparkles size={16} className="shrink-0" />
            <span className="shrink-0">{title}</span>
            {folded && note && <span className="min-w-0 flex-1 truncate pl-1 text-sm font-normal text-muted">{note.content}</span>}
            <ChevronDown size={17} className={cx("ml-auto shrink-0 text-muted transition-transform", !folded && "rotate-180")} />
          </button>
        ) : (
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-body">
            <Sparkles size={16} /> {title}
          </h2>
        )}
        {note && !folded && (
          <button onClick={() => void load(true)} disabled={busy} aria-label="Оновити аналіз" title="Оновити" className="icon-btn size-8">
            <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
          </button>
        )}
      </div>
      {folded ? null : note ? (
        <>
          <p className={cx("text-[15px] leading-relaxed whitespace-pre-line text-ink-2", busy && "opacity-50")}>{note.content}</p>
          <p className="mt-2 text-xs text-muted">
            {note.model} · {fmtDate(note.createdAt)}, {fmtTime(note.createdAt)}
          </p>
        </>
      ) : busy ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> ШІ аналізує…
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">{idle}</p>
          <button onClick={() => void load(false)} disabled={!ready} className="btn btn-ghost btn-sm">
            <Sparkles size={15} /> {action}
          </button>
        </div>
      )}
      {error && !folded && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </section>
  );
}

/** Review of one finished workout. */
export function AiWorkoutNote({ workoutId, initial, auto, ready }: { workoutId: string; initial: AiNote | null; auto: boolean; ready: boolean }) {
  const run = useCallback((force: boolean) => analyzeWorkoutAction(workoutId, force), [workoutId]);
  return <NoteCard title="Аналіз ШІ" initial={initial} auto={auto} ready={ready} idle="Прогрес проти минулого разу й порада на наступне тренування." run={run} />;
}

/** Today's coaching note on the home screen. */
export function CoachCard({ initial, auto }: { initial: AiNote | null; auto: boolean }) {
  return (
    <NoteCard title="Порада тренера" initial={initial} auto={auto} foldKey="wk:fold:coach" idle="Як іде тиждень відносно ваших цілей і що тренувати далі." run={coachNoteAction} />
  );
}

// ───────────────────────── Planning ─────────────────────────

const DIALOG = "w-full max-w-md space-y-4 rounded-t-[28px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-[28px] md:pb-5";

/**
 * "Plan with AI": one workout for a date, or a programme — on the days you tick, or a number
 * of sessions the model spreads over the coming week itself.
 */
export function PlanWithAi({ weeklyTarget = 3 }: { weeklyTarget?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "program">("one");
  const [wish, setWish] = useState("");
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [count, setCount] = useState(Math.min(6, Math.max(2, weeklyTarget)));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: { id: string; name: string; date: string }[]; why: string } | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    if (pending) return;
    setOpen(false);
    if (done) router.refresh();
  };

  return (
    <>
      <button
        onClick={() => {
          const t = dayOf();
          setToday(t);
          setDate(t);
          setDays([]);
          setError(null);
          setDone(null);
          setOpen(true);
        }}
        className="btn btn-ghost w-full px-3 sm:w-auto"
      >
        <Sparkles size={17} className="text-body" /> Скласти з ШІ
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 md:items-center md:p-6" onClick={close}>
          {done ? (
            <div role="dialog" aria-modal="true" aria-label="Програму складено" className={DIALOG} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold">Готово: {done.created.length} у плані</h2>
              {done.why && <p className="text-sm text-ink-2">{done.why}</p>}
              <ul className="divide-y divide-line rounded-2xl bg-surface-2">
                {done.created.map((w) => (
                  <li key={w.id}>
                    <Link href={`/workouts/${w.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[15px]">
                      <span className="truncate font-medium">{w.name}</span>
                      <span className="shrink-0 text-sm text-muted first-letter:uppercase">{fmtDate(w.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button onClick={close} className="btn btn-primary w-full">
                <Check size={17} strokeWidth={3} /> Добре
              </button>
            </div>
          ) : (
            <form
              role="dialog"
              aria-modal="true"
              aria-label="Скласти тренування з ШІ"
              className={DIALOG}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  if (mode === "one") {
                    const r = await planWorkoutAction({ wish, date });
                    if (r.ok) router.push(`/workouts/${r.id}`);
                    else setError(r.error);
                  } else {
                    const r = await planProgramAction({ wish, days, count, from: today });
                    if (r.ok) setDone({ created: r.created, why: r.why });
                    else setError(r.error);
                  }
                });
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Скласти з ШІ</h2>
                <button type="button" onClick={close} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
                  <X size={20} />
                </button>
              </div>
              <div className="flex rounded-full bg-surface-2 p-1" role="group" aria-label="Що скласти">
                {(
                  [
                    ["one", "Одне тренування"],
                    ["program", "Програма"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={cx("flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium", mode === value ? "bg-surface-3 text-ink" : "text-muted")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-ink-2">
                ШІ врахує ваші цілі, вагу й показники, минулі тренування, дані з Apple Watch і те, які мʼязи відстають, та збереже результат у
                запланованих.
              </p>
              {mode === "one" ? (
                <label className="block space-y-1.5">
                  <span className="text-sm text-ink-2">На коли</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field" />
                </label>
              ) : (
                <div className="space-y-2">
                  <span className="block text-sm text-ink-2">Дні тренувань — найближчі два тижні</span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => {
                      const on = days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          disabled={!on && days.length >= 7}
                          onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                          className={cx(
                            "flex flex-col items-center rounded-xl py-1.5 text-[11px] leading-tight transition disabled:opacity-30",
                            on ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2 text-muted hover:bg-surface-3",
                          )}
                        >
                          <span className="first-letter:uppercase">{fmtDate(d, { weekday: "short" })}</span>
                          <span className={cx("num text-[15px] font-semibold", !on && "text-ink")}>{fmtDate(d, { day: "numeric" })}</span>
                        </button>
                      );
                    })}
                  </div>
                  {days.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                      <span className="text-sm text-ink-2">
                        Дні не вибрано — ШІ сам розподілить
                        <span className="block text-xs text-muted">тренування на найближчі 7 днів</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setCount(Math.max(2, count - 1))} aria-label="Менше тренувань" className="icon-btn size-8 bg-surface-3 text-ink">
                          <Minus size={15} />
                        </button>
                        <span className="num w-6 text-center text-lg font-semibold" aria-label="Кількість тренувань">
                          {count}
                        </span>
                        <button type="button" onClick={() => setCount(Math.min(6, count + 1))} aria-label="Більше тренувань" className="icon-btn size-8 bg-surface-3 text-ink">
                          <Plus size={15} />
                        </button>
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">Вибрано днів: {days.length}. По одному тренуванню на кожен.</p>
                  )}
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm text-ink-2">Побажання (необовʼязково)</span>
                <textarea
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder={
                    mode === "one"
                      ? "Напр.: ноги й прес, до 45 хвилин, без присідань зі штангою"
                      : "Напр.: у середу йога, у суботу болдеринг — не перевантажуй руки; акцент на спину"
                  }
                  className="field resize-none"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-critical">
                  {error}
                </p>
              )}
              <button type="submit" disabled={pending} className="btn btn-primary w-full">
                {pending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> {mode === "one" ? "Складаю план…" : "Складаю програму…"}
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> {mode === "one" ? "Скласти тренування" : "Скласти програму"}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

/** A short question to the athlete before an AI change: what should be different? */
export function AiPromptDialog({
  title,
  hint,
  placeholder,
  submitLabel,
  busyLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  hint: string;
  placeholder: string;
  submitLabel: string;
  busyLabel: string;
  /** Resolves to an error text to show, or null when it worked (the dialog then closes). */
  onSubmit: (text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-6" onClick={() => !pending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={DIALOG}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const failed = await onSubmit(text);
            if (failed) setError(failed);
            else onClose();
          });
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-ink-2">{hint}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={800} placeholder={placeholder} aria-label="Що змінилось" autoFocus className="field resize-none" />
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? (
            <>
              <Loader2 size={17} className="animate-spin" /> {busyLabel}
            </>
          ) : (
            <>
              <Sparkles size={17} /> {submitLabel}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ───────────────────────── Looking back ─────────────────────────

/** A written report on the period chosen on the analytics page. Made on request, kept until refreshed. */
export function ReportCard({ weeks, initial }: { weeks: number; initial: AiNote | null }) {
  const run = useCallback((force: boolean) => periodReportAction(weeks, force), [weeks]);
  return (
    <NoteCard
      title="Звіт ШІ за період"
      initial={initial}
      auto={false}
      idle="Прогрес у вправах, баланс навантаження, пульс і відновлення за даними Apple Watch, де ви відносно своїх цілей і що змінити."
      action="Скласти звіт"
      run={run}
    />
  );
}

/** Reviews finished workouts that have none yet, one after another, with visible progress. */
export function ReviewBacklog() {
  const router = useRouter();
  const [state, setState] = useState<{ step: "idle" | "none" | "running" | "done"; done: number; total: number; name?: string; error?: string }>({ step: "idle", done: 0, total: 0 });
  const run = async () => {
    setState({ step: "running", done: 0, total: 0 });
    const list = await unreviewedWorkoutsAction();
    if (!list.ok) return setState({ step: "idle", done: 0, total: 0, error: list.error });
    if (list.workouts.length === 0) return setState({ step: "none", done: 0, total: 0 });
    let done = 0;
    for (const w of list.workouts) {
      setState({ step: "running", done, total: list.workouts.length, name: w.name });
      const r = await analyzeWorkoutAction(w.id);
      if (!r.ok) return setState({ step: "idle", done, total: list.workouts.length, error: r.error });
      done++;
    }
    setState({ step: "done", done, total: list.workouts.length });
    router.refresh();
  };
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-body">
          <Sparkles size={16} /> Минулі тренування
        </h2>
        <p className="mt-1 text-sm text-muted">
          {state.step === "running"
            ? state.total
              ? `Аналізую ${state.done + 1} з ${state.total}: ${state.name}`
              : "Зіставляю записи Apple Watch із тренуваннями…"
            : state.step === "done"
              ? `Готово: проаналізовано ${state.done}. Аналіз видно на сторінці кожного тренування.`
              : state.step === "none"
                ? "Усі тренування за останні два місяці вже мають аналіз."
                : "Зіставити записи Apple Watch із тренуваннями й проаналізувати ті, що ще без аналізу (до 10 за раз)."}
        </p>
        {state.error && (
          <p role="alert" className="mt-1 text-sm text-critical">
            {state.error}
          </p>
        )}
      </div>
      <button onClick={() => void run()} disabled={state.step === "running"} className="btn btn-ghost btn-sm">
        {state.step === "running" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Проаналізувати
      </button>
    </div>
  );
}
