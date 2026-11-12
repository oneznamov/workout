"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { saveProfileAction } from "@/lib/ai-actions";
import { cx } from "@/lib/format";
import { PROFILE_LIMITS, type Goal, type Profile } from "@/lib/profile";

/** Private goals and notes: what Claude and the AI coach read before planning or judging anything. */
export function ProfileEditor({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(true);
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
        пропонувати зміни. Бачите лише ви — друзям цілі не показуються.
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
                className={cx("min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted", g.done && "line-through")}
              />
              <button type="button" onClick={() => edit({ ...profile, goals: profile.goals.filter((x) => x.id !== g.id) })} aria-label="Видалити ціль" className="icon-btn size-8 hover:text-critical">
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
              <input
                value={g.details}
                onChange={(e) => patchGoal(g.id, { details: e.target.value })}
                maxLength={PROFILE_LIMITS.details}
                placeholder="Деталі: зараз 80 кг × 5, тренуюсь 3 рази на тиждень"
                aria-label="Деталі цілі"
                className="rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none placeholder:text-muted"
              />
              <input
                type="date"
                value={g.targetDate ?? ""}
                onChange={(e) => patchGoal(g.id, { targetDate: e.target.value || null })}
                aria-label="До якої дати"
                className="rounded-lg bg-surface-3 px-3 py-2 text-sm text-ink outline-none"
              />
            </div>
          </li>
        ))}
      </ul>
      {profile.goals.length < PROFILE_LIMITS.goals && (
        <button
          type="button"
          onClick={() => edit({ ...profile, goals: [...profile.goals, { id: crypto.randomUUID(), title: "", details: "", targetDate: null, done: false }] })}
          className="btn btn-ghost btn-sm"
        >
          <Plus size={15} /> Додати ціль
        </button>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Про мене</span>
        <textarea
          value={profile.about}
          onChange={(e) => edit({ ...profile, about: e.target.value })}
          rows={4}
          maxLength={PROFILE_LIMITS.about}
          placeholder="Досвід, травми й обмеження, скільки разів на тиждень можу тренуватись, яке є обладнання, що не люблю робити"
          className="field resize-y text-[15px]"
        />
      </label>
      <button
        disabled={pending || saved}
        onClick={() =>
          start(async () => {
            setProfile(await saveProfileAction(profile));
            setSaved(true);
          })
        }
        className="btn btn-primary"
      >
        {saved ? "Збережено" : pending ? "Зберігаю…" : "Зберегти цілі"}
      </button>
    </div>
  );
}
