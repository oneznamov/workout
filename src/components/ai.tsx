"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Mic, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  analyzeWorkoutAction,
  coachNoteAction,
  periodReportAction,
  planProgramAction,
  removeAiSettingsAction,
  saveAiSettingsAction,
  testAiAction,
  unreviewedWorkoutsAction,
} from "@/lib/ai-actions";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiNote, type AiProvider, type AiResult, type AiState } from "@/lib/ai-providers";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { addDays, cx, dayOf, fmtDate, fmtTime, weekStart } from "@/lib/format";

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
      </div>
      {folded ? null : note ? (
        <>
          <p className={cx("text-[15px] leading-relaxed whitespace-pre-line text-ink-2", busy && "opacity-50")}>{note.content}</p>
          {/* The refresh control sits at the bottom, away from the fold arrow in the header. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {note.model} · {fmtDate(note.createdAt)}, {fmtTime(note.createdAt)}
            </p>
            <button onClick={() => void load(true)} disabled={busy} className="btn btn-ghost btn-sm">
              <RefreshCw size={14} className={busy ? "animate-spin" : undefined} /> {busy ? "Оновлюю…" : "Оновити"}
            </button>
          </div>
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

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
const recognitionCtor = () => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** A text field you can also talk into, where the browser can listen (elsewhere the keyboard's own dictation does the same). */
function SpokenText({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const session = useRef<Recognition | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setCanListen(Boolean(recognitionCtor())));
    return () => session.current?.stop();
  }, []);
  const toggle = () => {
    if (listening) return session.current?.stop();
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    const before = value.trim();
    rec.lang = "uk-UA";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      const heard = Array.from(e.results, (r) => r[0].transcript).join(" ");
      onChange([before, heard.trim()].filter(Boolean).join(" "));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    session.current = rec;
    setListening(true);
    rec.start();
  };
  return (
    <div className="relative">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={800} placeholder={placeholder} aria-label="Ваш запит" className={cx("field resize-none", canListen && "pr-14")} />
      {canListen && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={listening}
          aria-label={listening ? "Зупинити диктування" : "Продиктувати голосом"}
          title={listening ? "Зупинити" : "Продиктувати голосом"}
          className={cx("absolute right-2 bottom-2 grid size-10 place-items-center rounded-full transition", listening ? "animate-pulse bg-critical text-white" : "bg-surface-3 text-ink")}
        >
          <Mic size={18} />
        </button>
      )}
    </div>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/**
 * "Plan with AI": say (or type) what you want in your own words — one workout or a whole
 * programme. Days can be ticked on a three-week calendar, but do not have to be: without them
 * the model reads the days from the request, and plans today when it says nothing.
 */
export function PlanWithAi() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [today, setToday] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: { id: string; name: string; date: string }[]; why: string } | null>(null);
  const [pending, start] = useTransition();
  useLockScroll(open);
  const close = () => {
    if (pending) return;
    setOpen(false);
    if (done) router.refresh();
  };
  const first = today ? weekStart(today) : "";

  return (
    <>
      <button
        onClick={() => {
          setToday(dayOf());
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
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/70 md:items-center md:p-6" onClick={close}>
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
                  const r = await planProgramAction({ wish, days });
                  if (!r.ok) return setError(r.error);
                  if (r.created.length === 1) router.push(`/workouts/${r.created[0].id}`);
                  else setDone({ created: r.created, why: r.why });
                });
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Скласти з ШІ</h2>
                <button type="button" onClick={close} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-ink-2">
                Скажіть своїми словами, що потрібно — одне тренування чи програму. ШІ врахує ваші цілі, показники, минулі тренування й дані з
                Apple Watch.
              </p>
              <SpokenText
                value={wish}
                onChange={setWish}
                placeholder="Напр.: три тренування цього тижня, у середу йога — не перевантажуй руки. Або: сьогодні ноги на 40 хвилин"
              />
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink-2">Дні — якщо хочете вказати точно</span>
                  {days.length > 0 && (
                    <button type="button" onClick={() => setDays([])} className="text-xs text-accent">
                      Скинути
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {WEEKDAYS.map((d, i) => (
                    <span key={d} className={cx("text-[11px] font-semibold", i >= 5 ? "text-ink-2" : "text-muted")}>
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: 21 }, (_, i) => addDays(first, i)).map((d) => {
                    const on = days.includes(d);
                    const past = d < today;
                    const isToday = d === today;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", сьогодні" : ""}`}
                        disabled={past || (!on && days.length >= 7)}
                        onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                        className={cx(
                          "num relative grid h-10 place-items-center rounded-xl text-[15px] font-semibold transition",
                          on ? "bg-accent text-accent-ink" : past ? "text-muted/40" : "bg-surface-2 text-ink hover:bg-surface-3",
                          isToday && !on && "ring-2 ring-accent",
                          !on && !past && days.length >= 7 && "opacity-40",
                        )}
                      >
                        {fmtDate(d, { day: "numeric" })}
                        {isToday && <span className={cx("absolute bottom-0.5 size-1 rounded-full", on ? "bg-accent-ink" : "bg-accent")} />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">
                  {days.length
                    ? `Вибрано днів: ${days.length} — по одному тренуванню на кожен.`
                    : "Днів не вибрано — ШІ візьме їх із вашого опису, а без опису складе одне тренування на сьогодні (обведено)."}
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-critical">
                  {error}
                </p>
              )}
              <button type="submit" disabled={pending} className="btn btn-primary w-full">
                {pending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> Складаю…
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> Скласти
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
  useLockScroll();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/70 md:items-center md:p-6" onClick={() => !pending && onClose()}>
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
        <SpokenText value={text} onChange={setText} placeholder={placeholder} />
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
