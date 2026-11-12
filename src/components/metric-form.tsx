"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { deleteMetricAction, logMetricAction } from "@/lib/actions";

export function WeightForm({ today }: { today: string }) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [pending, start] = useTransition();
  const num = (s: string) => Number(s.replace(",", "."));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (weight) await logMetricAction("body_mass", day, num(weight));
          if (fat) await logMetricAction("body_fat_percentage", day, num(fat));
          setWeight("");
          setFat("");
          router.refresh();
        });
      }}
    >
      <label className="space-y-1">
        <span className="block text-xs text-muted">Дата</span>
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required className="field w-auto" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">Вага, кг</span>
        <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="80.5" className="field w-24" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">Жир, %</span>
        <input value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" placeholder="—" className="field w-20" />
      </label>
      <button type="submit" disabled={pending || (!weight && !fat)} className="btn btn-primary">
        {pending ? "Збереження…" : "Записати"}
      </button>
    </form>
  );
}

export function DeleteMetricButton({ metric, day }: { metric: string; day: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      aria-label="Видалити запис"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteMetricAction(metric, day);
          router.refresh();
        })
      }
      className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink"
    >
      <X size={14} />
    </button>
  );
}
