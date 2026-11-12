"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bike, Footprints, Plus } from "lucide-react";
import { addCardioAction } from "@/lib/actions";
import { cx } from "@/lib/format";

/** Add a run or a ride by hand (for sessions the watch did not record). */
export function CardioForm({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"run" | "cycle">("run");
  const [day, setDay] = useState(today);
  const [time, setTime] = useState("08:00");
  const [km, setKm] = useState("");
  const [min, setMin] = useState("");
  const [hr, setHr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-sm btn-ghost">
        <Plus size={15} /> Додати вручну
      </button>
    );
  }
  return (
    <form
      className="card w-full space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const durationMin = num(min);
        if (!durationMin || durationMin <= 0) return setError("Вкажіть тривалість у хвилинах");
        setError(null);
        start(async () => {
          try {
            await addCardioAction({
              kind,
              startAt: new Date(`${day}T${time}`).toISOString(),
              durationMin,
              distanceKm: num(km),
              avgHr: num(hr),
            });
            setOpen(false);
            setKm("");
            setMin("");
            setHr("");
            router.refresh();
          } catch {
            setError("Не вдалося зберегти. Перевірте звʼязок і значення.");
          }
        });
      }}
    >
      <div className="inline-flex rounded-full bg-surface-2 p-1" role="group" aria-label="Тип">
        {(
          [
            ["run", "Біг", Footprints],
            ["cycle", "Вело", Bike],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold",
              kind === k ? "bg-accent text-accent-ink" : "text-muted",
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="space-y-1">
          <span className="caps block">Дата</span>
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required className="field" />
        </label>
        <label className="space-y-1">
          <span className="caps block">Початок</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="field" />
        </label>
        <label className="space-y-1">
          <span className="caps block">Дистанція, км</span>
          <input value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" placeholder="5.0" className="field" />
        </label>
        <label className="space-y-1">
          <span className="caps block">Час, хв</span>
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="30" required className="field" />
        </label>
        <label className="space-y-1">
          <span className="caps block">Пульс, сер.</span>
          <input value={hr} onChange={(e) => setHr(e.target.value)} inputMode="numeric" placeholder="—" className="field" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
          Скасувати
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </form>
  );
}
