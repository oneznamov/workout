"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, Plus, Thermometer, Trash2 } from "lucide-react";
import { saveProfileAction, setSickAction } from "@/lib/ai-actions";
import { cx } from "@/lib/format";
import { saveMeasurementsAction } from "@/lib/actions";
import { fmtDate, fmtNum } from "@/lib/format";
import { MEASURES, type MeasureKey } from "@/lib/measurements";
import { EXPERIENCE_LABEL, PROFILE_LIMITS, SEX_LABEL, type Experience, type Goal, type Profile, type Sex } from "@/lib/profile";

/** Private goals: what Claude and the AI coach read before planning or judging anything. */
export type GoalProgressView = Record<string, { current: number | null; unit: string; fraction: number | null }>;

const metricValue = (g: Goal) => (!g.metric ? "none" : g.metric.kind === "body_mass" ? "body_mass" : g.metric.kind === "measure" ? `measure:${g.metric.key}` : `exercise:${g.metric.exerciseId}`);

/** A thin bar from where the goal started to its target, with the numbers under it. */
export function GoalBar({ goal, progress }: { goal: Goal; progress?: GoalProgressView[string] }) {
  if (!goal.metric || goal.target == null) return null;
  const unit = progress?.unit ?? (goal.metric.kind === "measure" ? "см" : "кг");
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Прогрес цілі: ${goal.title}`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="num mt-1 flex justify-between gap-3 text-xs text-muted">
        <span>
          {progress?.current != null ? (
            <>
              зараз <span className="font-semibold text-ink">{fmtNum(progress.current, 1)}</span> {unit}
            </>
          ) : (
            "ще немає даних"
          )}
        </span>
        <span>
          ціль {fmtNum(goal.target, 1)} {unit}
          {progress?.fraction != null && ` · ${pct}%`}
        </span>
      </div>
    </div>
  );
}

export function GoalsEditor({ initial, progress = {}, exercises = [] }: { initial: Profile; progress?: GoalProgressView; exercises?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const edit = (next: Profile) => {
    setProfile(next);
    setSaved(false);
  };
  const patchGoal = (id: string, patch: Partial<Goal>) => edit({ ...profile, goals: profile.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Напишіть, чого хочете досягти. Claude (через конектор) і вбудований ШІ читають це перед кожним планом та аналізом і можуть
        пропонувати зміни. Бачите лише ви — команді цілі не показуються.
      </p>
      <ul className="space-y-3">
        {profile.goals.map((g) => (
          <li key={g.id} className={cx("space-y-2 rounded-2xl bg-surface-2 p-3", g.done && "opacity-60")}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => patchGoal(g.id, { done: !g.done })}
                aria-pressed={g.done}
                aria-label={g.done ? "Позначити як не досягнуту" : "Позначити як досягнуту"}
                className={cx("grid size-8 shrink-0 place-items-center rounded-full", g.done ? "bg-accent text-accent-ink" : "bg-surface-3 text-muted")}
              >
                <Check size={16} strokeWidth={3} />
              </button>
              <input
                value={g.title}
                onChange={(e) => patchGoal(g.id, { title: e.target.value })}
                maxLength={PROFILE_LIMITS.title}
                placeholder="Ціль: напр. жим лежачи 100 кг"
                aria-label="Ціль"
                className={cx(
                  "min-w-0 flex-1 rounded-lg border border-transparent bg-surface-3 px-3 py-2 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted focus:border-accent",
                  g.done && "line-through",
                )}
              />
              <button type="button" onClick={() => edit({ ...profile, goals: profile.goals.filter((x) => x.id !== g.id) })} aria-label="Видалити ціль" className="icon-btn size-8 hover:text-critical">
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
              <select
                value={metricValue(g)}
                onChange={(e) => {
                  const v = e.target.value;
                  const [kind, ref] = v.split(":");
                  const metric =
                    v === "none"
                      ? null
                      : v === "body_mass"
                        ? ({ kind: "body_mass" } as const)
                        : kind === "measure"
                          ? ({ kind: "measure", key: ref } as const)
                          : ({ kind: "exercise", exerciseId: ref, name: exercises.find((x) => x.id === ref)?.name ?? "" } as const);
                  // A different yardstick starts counting from scratch.
                  patchGoal(g.id, { metric, start: null, target: metric ? g.target : null });
                }}
                aria-label="Чим вимірювати ціль"
                className="min-w-0 rounded-lg border border-transparent bg-surface-3 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="none">Без вимірювання</option>
                <option value="body_mass">Вага тіла, кг</option>
                <optgroup label="Заміри, см">
                  {MEASURES.map((m) => (
                    <option key={m.key} value={`measure:${m.key}`}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Вага у вправі, кг">
                  {exercises.map((x) => (
                    <option key={x.id} value={`exercise:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                inputMode="decimal"
                disabled={!g.metric}
                value={g.target ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  patchGoal(g.id, { target: e.target.value && Number.isFinite(n) ? n : null });
                }}
                placeholder="Ціль"
                aria-label="Цільове значення"
                className="num rounded-lg border border-transparent bg-surface-3 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent disabled:opacity-40"
              />
            </div>
            <GoalBar goal={g} progress={progress[g.id]} />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
              <input
                value={g.details}
                onChange={(e) => patchGoal(g.id, { details: e.target.value })}
                maxLength={PROFILE_LIMITS.details}
                placeholder="Деталі (необовʼязково): зараз 80 кг × 5"
                aria-label="Деталі цілі"
                className="rounded-lg border border-transparent bg-surface-3 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
              <input
                type="date"
                value={g.targetDate ?? ""}
                onChange={(e) => patchGoal(g.id, { targetDate: e.target.value || null })}
                aria-label="До якої дати"
                className="rounded-lg border border-transparent bg-surface-3 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          </li>
        ))}
      </ul>
      {profile.goals.length < PROFILE_LIMITS.goals && (
        <button
          type="button"
          onClick={() => edit({ ...profile, goals: [...profile.goals, { id: crypto.randomUUID(), title: "", details: "", targetDate: null, done: false, metric: null, target: null, start: null }] })}
          className="btn btn-ghost btn-sm"
        >
          <Plus size={15} /> Додати ціль
        </button>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || saved}
          onClick={() =>
            start(async () => {
              setError(false);
              try {
                setProfile(await saveProfileAction({ goals: profile.goals }));
                setSaved(true);
                // Other screens (and this one, when you come back) must see the saved version.
                router.refresh();
              } catch {
                setError(true);
              }
            })
          }
          className="btn btn-primary"
        >
          {saved ? "Збережено" : pending ? "Зберігаю…" : "Зберегти цілі"}
        </button>
        {!saved && !pending && !error && <span className="text-xs text-warning">Є незбережені зміни</span>}
        {error && (
          <span role="alert" className="text-xs text-critical">
            Не вдалося зберегти — перевірте звʼязок і спробуйте ще раз.
          </span>
        )}
      </div>
    </div>
  );
}

const SaveRow = ({ saved, pending, error, label, onSave }: { saved: boolean; pending: boolean; error: boolean; label: string; onSave: () => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <button disabled={pending || saved} onClick={onSave} className="btn btn-primary">
      {saved ? "Збережено" : pending ? "Зберігаю…" : label}
    </button>
    {!saved && !pending && !error && <span className="text-xs text-warning">Є незбережені зміни</span>}
    {error && (
      <span role="alert" className="text-xs text-critical">
        Не вдалося зберегти — перевірте звʼязок і спробуйте ще раз.
      </span>
    )}
  </div>
);

/** Who the athlete is: the basics every plan and every judgement depends on. */
export function PersonForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const edit = (patch: Partial<Profile>) => {
    setP({ ...p, ...patch });
    setSaved(false);
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-sm text-ink-2">Стать</span>
        <div className="flex rounded-full bg-surface-2 p-1" role="group" aria-label="Стать">
          {(Object.keys(SEX_LABEL) as Sex[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => edit({ sex: p.sex === v ? null : v })}
              aria-pressed={p.sex === v}
              className={cx("flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium", p.sex === v ? "bg-surface-3 text-ink" : "text-muted")}
            >
              {SEX_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Дата народження</span>
          <input type="date" value={p.birthDate ?? ""} onChange={(e) => edit({ birthDate: e.target.value || null })} className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Зріст, см</span>
          <input
            inputMode="numeric"
            value={p.heightCm ?? ""}
            onChange={(e) => edit({ heightCm: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })}
            placeholder="180"
            className="field num"
          />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Досвід тренувань</span>
        <select value={p.experience ?? ""} onChange={(e) => edit({ experience: (e.target.value || null) as Experience | null })} className="field">
          <option value="">Не вказано</option>
          {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((v) => (
            <option key={v} value={v}>
              {EXPERIENCE_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Про мене</span>
        <textarea
          value={p.about}
          onChange={(e) => edit({ about: e.target.value })}
          rows={4}
          maxLength={PROFILE_LIMITS.about}
          placeholder="Травми й обмеження, скільки разів на тиждень можу тренуватись, яке є обладнання, що не люблю робити"
          className="field resize-y text-[15px]"
        />
      </label>
      <SaveRow
        saved={saved}
        pending={pending}
        error={error}
        label="Зберегти"
        onSave={() =>
          start(async () => {
            setError(false);
            try {
              setP(await saveProfileAction({ sex: p.sex, birthDate: p.birthDate, heightCm: p.heightCm, experience: p.experience, about: p.about }));
              setSaved(true);
              router.refresh();
            } catch {
              setError(true);
            }
          })
        }
      />
    </div>
  );
}

export type MeasureState = Partial<Record<MeasureKey, { value: number; day: string; previous: number | null }>>;

/** Tape measurements: three basic ones by default, the full set on request. Empty fields are not changed. */
export function MeasurementsForm({ today, latest }: { today: string; latest: MeasureState }) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const [day, setDay] = useState(today);
  const [values, setValues] = useState<Partial<Record<MeasureKey, string>>>({});
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        // Remembered choice, or the full set when extended measurements already exist.
        const stored = localStorage.getItem("wk:measures");
        setFull(stored ? stored === "full" : MEASURES.some((m) => !m.simple && latest[m.key]));
      } catch {
        /* storage blocked — keep the simple set */
      }
    });
  }, [latest]);
  const pick = (next: boolean) => {
    setFull(next);
    try {
      localStorage.setItem("wk:measures", next ? "full" : "simple");
    } catch {
      /* ignore */
    }
  };
  const filled = Object.values(values).some((v) => v && v.trim());

  return (
    <div className="space-y-4">
      <div className="flex rounded-full bg-surface-2 p-1" role="group" aria-label="Набір замірів">
        {(
          [
            [false, "Прості"],
            [true, "Розширені"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => pick(v)}
            aria-pressed={full === v}
            className={cx("flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium", full === v ? "bg-surface-3 text-ink" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MEASURES.filter((m) => full || m.simple).map((m) => {
          const last = latest[m.key];
          const delta = last?.previous != null ? last.value - last.previous : null;
          return (
            <label key={m.key} className="block space-y-1">
              <span className="flex items-baseline justify-between gap-2 text-sm text-ink-2">
                {m.label}
                {delta != null && delta !== 0 && (
                  <span className="num text-xs text-muted">
                    {delta > 0 ? "+" : "−"}
                    {fmtNum(Math.abs(delta), 1)}
                  </span>
                )}
              </span>
              <input
                inputMode="decimal"
                value={values[m.key] ?? ""}
                onChange={(e) => setValues({ ...values, [m.key]: e.target.value })}
                placeholder={last ? fmtNum(last.value, 1) : "см"}
                aria-label={`${m.label}, см`}
                className="field num"
              />
              <span className="block text-[11px] text-muted">{last ? `${fmtNum(last.value, 1)} см · ${fmtDate(last.day)}` : "ще не міряли"}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Дата заміру</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="field" />
        </label>
        <button
          disabled={pending || !filled}
          onClick={() =>
            start(async () => {
              setError(false);
              try {
                const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v && v.trim() ? Number(v.replace(",", ".")) : null]));
                await saveMeasurementsAction(day, parsed);
                setValues({});
                router.refresh();
              } catch {
                setError(true);
              }
            })
          }
          className="btn btn-primary"
        >
          {pending ? "Зберігаю…" : "Записати заміри"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          Не вдалося зберегти — перевірте числа й спробуйте ще раз.
        </p>
      )}
      <p className="text-xs text-muted">У сантиметрах. Заповнюйте лише те, що міряли сьогодні — решта лишиться як була.</p>
    </div>
  );
}

/** Illness mode: one button on, one button off. While it is on, nothing in the app nags. */
export function SickMode({ sick, today, compact }: { sick: Profile["sick"]; today: string; compact?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const set = (on: boolean) =>
    start(async () => {
      await setSickAction(on, note);
      router.refresh();
    });
  if (sick) {
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${sick.since}T12:00:00Z`)) / 86400000) + 1;
    return (
      <div className={cx("flex flex-wrap items-center justify-between gap-3", !compact && "rounded-2xl bg-warning/12 p-3.5 ring-1 ring-warning/40")}>
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-warning">
            <Thermometer size={17} /> Режим хвороби · {days}-й день
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            З {fmtDate(sick.since).replace(/\.$/, "")}
            {sick.note && ` · ${sick.note}`}. Цілі тижня на паузі, серія тижнів не переривається, ШІ радить відновлення.
          </p>
        </div>
        <button disabled={pending} onClick={() => set(false)} className="btn btn-primary btn-sm">
          <Check size={15} strokeWidth={3} /> Я одужую
        </button>
      </div>
    );
  }
  if (compact) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Захворіли? Увімкніть режим хвороби: цілі тижня стануть на паузу, пропущені тренування не дорікатимуть, серія тижнів у команді не
        перерветься, а ШІ радитиме відновлення й легке повернення.
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Що саме (необовʼязково): застуда, спина…" aria-label="Що саме" className="field min-w-0 flex-1 basis-52" />
        <button disabled={pending} onClick={() => set(true)} className="btn btn-ghost">
          <Thermometer size={17} /> Я хворію
        </button>
      </div>
    </div>
  );
}
