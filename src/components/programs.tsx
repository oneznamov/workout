"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { History, Pencil, Plus, Route, Sparkles, Trash2, X } from "lucide-react";
import { addProgramWorkoutAction, createProgramAction, deleteProgramAction, saveProgramVersionAction, updateProgramAction } from "@/lib/actions";
import { planProgramAction, reviseProgramAction } from "@/lib/ai-actions";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { addDays, cx, dayOf } from "@/lib/format";
import { AiPromptDialog } from "./ai";
import { AI_STEPS, AiWorking } from "./ai-working";

type Fields = { name: string; description: string; forecast: string; startsOn: string; endsOn: string };
const SHEET = "w-full max-w-md space-y-4 rounded-t-[28px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-[28px] md:pb-5";

function ProgramFields({ value, onChange }: { value: Fields; onChange: (v: Fields) => void }) {
  return (
    <>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Назва</span>
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} maxLength={80} required placeholder="Напр.: Вступна, 4 тижні" className="field" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Початок</span>
          <input type="date" value={value.startsOn} onChange={(e) => onChange({ ...value, startsOn: e.target.value })} required className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-ink-2">Кінець</span>
          <input type="date" value={value.endsOn} onChange={(e) => onChange({ ...value, endsOn: e.target.value })} required className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Для чого ця програма</span>
        <textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={3} maxLength={2000} placeholder="Мета етапу і як він побудований" className="field resize-none text-[15px]" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Очікуваний результат</span>
        <textarea value={value.forecast} onChange={(e) => onChange({ ...value, forecast: e.target.value })} rows={3} maxLength={2000} placeholder="Чого маєте досягти наприкінці: ваги, обʼєми, самопочуття" className="field resize-none text-[15px]" />
      </label>
    </>
  );
}

/**
 * "New programme": a name, dates and what it is for. Then either an empty one, to be filled with
 * workouts by hand, or — with AI connected — one filled with workouts for the whole period.
 */
export function NewProgramButton({ ai = false, startOpen = false, onClosed }: { ai?: boolean; /** opened by something else: no button of its own */ startOpen?: boolean; onClosed?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [fields, setFields] = useState<Fields>(() => {
    const today = startOpen ? dayOf() : "";
    return { name: "", description: "", forecast: "", startsOn: today, endsOn: today ? addDays(today, 27) : "" };
  });
  const close = () => {
    setOpen(false);
    onClosed?.();
  };
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useLockScroll(open);
  const fill = () => {
    setError(null);
    setFilling(true);
    start(async () => {
      const r = await planProgramAction({ program: fields });
      setFilling(false);
      if (!r.ok) return setError(r.error);
      if (r.programId) router.push(`/programs/${r.programId}`);
    });
  };
  return (
    <>
      {!startOpen && (
        <button
          onClick={() => {
            const today = dayOf();
            setFields({ name: "", description: "", forecast: "", startsOn: today, endsOn: addDays(today, 27) });
            setError(null);
            setOpen(true);
          }}
          className="flex items-center gap-1.5 text-sm text-accent"
        >
          <Plus size={15} /> Нова
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/70 md:items-center md:p-6" onClick={() => !pending && close()}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Нова програма"
            className={SHEET}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              start(() => createProgramAction(fields));
            }}
          >
            {filling && <AiWorking title="ШІ складає програму" steps={AI_STEPS.plan} expect={150} />}
            <div className={cx("space-y-4", filling && "hidden")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Нова програма</h2>
              <button type="button" onClick={close} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
                <X size={20} />
              </button>
            </div>
            <ProgramFields value={fields} onChange={setFields} />
            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}
            {ai && (
              <button type="button" disabled={pending || !fields.name.trim()} onClick={fill} className="btn btn-primary w-full">
                <Sparkles size={17} /> {filling ? "ШІ складає тренування…" : "Створити й заповнити з ШІ"}
              </button>
            )}
            <button type="submit" disabled={pending} className={ai ? "btn btn-ghost w-full" : "btn btn-primary w-full"}>
              <Route size={17} /> {pending && !filling ? "Створюю…" : ai ? "Створити порожню" : "Створити програму"}
            </button>
            {ai && <p className="text-xs text-muted">ШІ розкладе тренування на весь період з огляду на ваші цілі, показники й минулі тренування. Порожню програму наповнюєте самі.</p>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Everything that can be done to a programme: revise with AI, edit by hand, add a workout, save a version, delete. */
export function ProgramActions({ id, initial, ai }: { id: string; initial: Fields; ai: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "edit" | "add" | "version" | null>(null);
  const [fields, setFields] = useState(initial);
  const [note, setNote] = useState("");
  const [day, setDay] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useLockScroll(mode === "edit" || mode === "add" || mode === "version");
  const close = () => !pending && setMode(null);
  const sheet = (title: string, body: React.ReactNode, onSubmit: () => void, submit: string) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/70 md:items-center md:p-6" onClick={close}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={SHEET}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={close} disabled={pending} aria-label="Закрити" className="icon-btn bg-surface-2">
            <X size={20} />
          </button>
        </div>
        {body}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Зберігаю…" : submit}
        </button>
      </form>
    </div>
  );
  const noteField = (label: string, placeholder: string) => (
    <label className="block space-y-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={placeholder} className="field" />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ai && (
          <button onClick={() => setMode("ai")} className="btn btn-primary btn-sm">
            <Sparkles size={15} /> Оновити з ШІ
          </button>
        )}
        <button
          onClick={() => {
            setDay(dayOf());
            setMode("add");
          }}
          className="btn btn-ghost btn-sm"
        >
          <Plus size={15} /> Тренування
        </button>
        <button
          onClick={() => {
            setFields(initial);
            setNote("");
            setMode("edit");
          }}
          className="btn btn-ghost btn-sm"
        >
          <Pencil size={15} /> Редагувати
        </button>
        <button
          onClick={() => {
            setNote("");
            setMode("version");
          }}
          className="btn btn-ghost btn-sm"
        >
          <History size={15} /> Зберегти версію
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Видалити програму? Виконані тренування залишаться в щоденнику.")) return;
            const keep = !window.confirm("Видалити також її заплановані тренування? «Скасувати» — залишити їх у плані.");
            start(() => deleteProgramAction(id, keep));
          }}
          className="btn btn-danger btn-sm"
        >
          <Trash2 size={15} /> Видалити
        </button>
      </div>
      {message && <p className="rounded-2xl bg-body/15 px-3.5 py-2.5 text-sm text-ink-2">{message}</p>}

      {mode === "ai" && (
        <AiPromptDialog
          title="Оновити програму з ШІ"
          hint="Напишіть, що змінити: ускладнити, додати день, зсунути через поїздку, зробити акцент. Виконане лишається, решта програми перебудується, а зміна потрапить в історію."
          placeholder="Напр.: наступні два тижні у відʼїзді — лише власна вага; або: стало легко, додай навантаження"
          submitLabel="Оновити програму"
          busyLabel="Перебудовую програму…"
          steps={AI_STEPS.plan}
          expect={150}
          onSubmit={async (text) => {
            const r = await reviseProgramAction(id, text);
            if (!r.ok) return r.error;
            setMessage(`Програму оновлено: ${r.workouts} тренувань попереду. ${r.why}`);
            router.refresh();
            return null;
          }}
          onClose={() => setMode(null)}
        />
      )}
      {mode === "edit" &&
        sheet(
          "Редагувати програму",
          <>
            <ProgramFields value={fields} onChange={setFields} />
            {noteField("Що змінили (для історії)", "Напр.: подовжив на тиждень")}
          </>,
          () =>
            start(async () => {
              await updateProgramAction(id, fields, note);
              setMode(null);
              router.refresh();
            }),
          "Зберегти",
        )}
      {mode === "add" &&
        sheet(
          "Додати тренування",
          <label className="block space-y-1.5">
            <span className="text-sm text-ink-2">На коли</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} required className="field" />
          </label>,
          () => start(() => addProgramWorkoutAction(id, day)),
          "Створити й відкрити",
        )}
      {mode === "version" &&
        sheet(
          "Зберегти версію",
          <>
            <p className="text-sm text-ink-2">Якщо ви змінювали тренування програми вручну, збережіть версію — в історії лишиться, якою вона стала і чому.</p>
            {noteField("Що змінили", "Напр.: замінив присідання на жим ногами")}
          </>,
          () =>
            start(async () => {
              await saveProgramVersionAction(id, note);
              setMode(null);
              router.refresh();
            }),
          "Зберегти в історію",
        )}
    </div>
  );
}
