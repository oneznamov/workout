"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Moon, Pencil, Sparkles } from "lucide-react";
import { SpokenText } from "@/components/ai";
import { cx } from "@/lib/format";

const QUICK: { label: string; request: string }[] = [
  { label: "Легше", request: "Зроби тренування легшим: менша вага й менше підходів." },
  { label: "Важче", request: "Зроби тренування важчим: додай вагу або підходи там, де є запас." },
  { label: "Коротше", request: "Скороти до приблизно 30 хвилин, залиш головне." },
  { label: "Лише гантелі", request: "Є лише гантелі та власна вага — заміни вправи відповідно." },
  { label: "Інші вправи", request: "Заміни вправи на інші для тих самих мʼязів — хочу різноманіття." },
];

/**
 * The one place a planned workout is changed from: by hand, or by telling the AI what is
 * different today — tap a ready-made wish, say it, or type it. `suggestion` is a wish the app
 * itself proposes (a short night, for instance).
 */
export function ChangeWorkout({
  ai,
  suggestion,
  onManual,
  onAi,
}: {
  /** whether an AI is connected */
  ai: boolean;
  suggestion?: { label: string; request: string } | null;
  onManual: () => void;
  /** resolves to an error text, or null when the workout was rebuilt */
  onAi: (request: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = [...picked, text.trim()].filter(Boolean).join(" ");
  const submit = async (ask = request) => {
    setBusy(true);
    setError(null);
    const failed = await onAi(ask);
    setBusy(false);
    if (failed) return setError(failed);
    setOpen(false);
    setPicked([]);
    setText("");
  };
  return (
    <section className="card space-y-3 p-3.5" aria-label="Змінити тренування">
      {/* The app's own proposal (a short night): explained in a line, applied in one tap. */}
      {suggestion && (
        <div className="space-y-2 rounded-2xl bg-warning/10 p-3 ring-1 ring-warning/30">
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <Moon size={16} className="mt-0.5 shrink-0 text-warning" /> <span>{suggestion.label}</span>
          </p>
          {ai && (
            <button disabled={busy} onClick={() => void submit(suggestion.request)} className="btn btn-primary btn-sm">
              {busy && !open ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy && !open ? "ШІ полегшує…" : "Полегшити через сон"}
            </button>
          )}
          {error && !open && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
        </div>
      )}
      <div className={cx("grid gap-2", ai && "grid-cols-2")}>
        {ai && (
          <button onClick={() => setOpen(!open)} aria-expanded={open} className={cx("btn px-2", open ? "bg-body/20 text-ink" : "btn-ghost")}>
            <Sparkles size={17} className="text-body" /> Змінити з ШІ
          </button>
        )}
        <button onClick={onManual} className="btn btn-ghost px-2">
          <Pencil size={16} /> Змінити вручну
        </button>
      </div>
      {!ai && (
        <p className="text-xs text-muted">
          Щоб змінювати словами («легше», «болить плече»), підключіть ШІ в{" "}
          <Link href="/settings" className="text-accent">
            Налаштуваннях
          </Link>
          .
        </p>
      )}
      {open && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void submit();
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Готові побажання">
            {QUICK.map((q) => {
              const on = picked.includes(q.request);
              return (
                <button
                  key={q.request}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? picked.filter((p) => p !== q.request) : [...picked, q.request])}
                  className={cx("rounded-full px-3 py-1.5 text-[13px] font-medium", on ? "bg-body text-white" : "bg-surface-2 text-ink-2")}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
          <SpokenText value={text} onChange={setText} rows={2} placeholder="Або своїми словами: болить плече, є 40 хвилин…" />
          {error && open && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" /> ШІ перезбирає…
              </>
            ) : (
              <>
                <Sparkles size={17} /> {request ? "Перезібрати тренування" : "Перевірити й покращити"}
              </>
            )}
          </button>
        </form>
      )}
    </section>
  );
}
