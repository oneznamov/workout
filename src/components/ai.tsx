"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { analyzeWorkoutAction, coachNoteAction, planWorkoutAction, removeAiSettingsAction, saveAiSettingsAction, testAiAction } from "@/lib/ai-actions";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiNote, type AiProvider, type AiResult, type AiState } from "@/lib/ai-providers";
import { cx, dayOf, fmtDate, fmtTime } from "@/lib/format";

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
        Підключіть власний API-ключ — і застосунок сам аналізуватиме кожне завершене тренування, щодня даватиме пораду на головній і
        зможе скласти або доповнити план. Без ключа ці функції вимкнені.
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
  run,
}: {
  title: string;
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

  useEffect(() => {
    if (note || !auto || !ready || started.current) return;
    started.current = true;
    void Promise.resolve().then(() => load(false));
  }, [note, auto, ready, load]);

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-body">
          <Sparkles size={16} /> {title}
        </h2>
        {note && (
          <button onClick={() => void load(true)} disabled={busy} aria-label="Оновити аналіз" title="Оновити" className="icon-btn size-8">
            <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
          </button>
        )}
      </div>
      {note ? (
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
            <Sparkles size={15} /> Проаналізувати
          </button>
        </div>
      )}
      {error && (
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
  return <NoteCard title="Порада тренера" initial={initial} auto={auto} idle="Як іде тиждень відносно ваших цілей і що тренувати далі." run={coachNoteAction} />;
}

// ───────────────────────── Planning ─────────────────────────

/** "Plan with AI": optional wish + date → a planned workout appears in the diary. */
export function PlanWithAi() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        onClick={() => {
          setDate(dayOf());
          setError(null);
          setOpen(true);
        }}
        className="btn btn-ghost w-full px-3 sm:w-auto"
      >
        <Sparkles size={17} className="text-body" /> Скласти з ШІ
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onClick={() => !pending && setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Скласти тренування з ШІ"
            className="pb-safe w-full max-w-md space-y-4 rounded-t-[28px] bg-surface p-5 md:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = await planWorkoutAction({ wish, date });
                if (r.ok) router.push(`/workouts/${r.id}`);
                else setError(r.error);
              });
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Скласти з ШІ</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-ink-2">ШІ врахує ваші цілі, останні тренування й те, які мʼязи відстають, і збереже план як заплановане тренування.</p>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink-2">Побажання (необовʼязково)</span>
              <textarea value={wish} onChange={(e) => setWish(e.target.value)} rows={3} maxLength={500} placeholder="Напр.: ноги й прес, до 45 хвилин, без присідань зі штангою" className="field resize-none" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-ink-2">На коли</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field" />
            </label>
            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}
            <button type="submit" disabled={pending} className="btn btn-primary w-full">
              {pending ? (
                <>
                  <Loader2 size={17} className="animate-spin" /> Складаю план…
                </>
              ) : (
                <>
                  <Sparkles size={17} /> Скласти тренування
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
