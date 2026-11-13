"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, History, Pencil, Plus, Route, Sparkles, Trash2, X } from "lucide-react";
import { addGoalAction, addProgramWorkoutAction, createProgramAction, deleteProgramAction, programGoalsAction, saveProgramVersionAction, updateProgramAction, type ProgramGoal } from "@/lib/actions";
import { planProgramAction, reviseProgramAction } from "@/lib/ai-actions";
import { useLockScroll } from "@/lib/client/lock-scroll";
import { addDays, cx, dayOf, fmtDate } from "@/lib/format";
import { AiPromptDialog } from "./ai";
import { AI_STEPS, AiWorking } from "./ai-working";

type Fields = { name: string; description: string; forecast: string; goalIds: string[]; startsOn: string; endsOn: string };
const SHEET = "w-full max-w-md space-y-4 rounded-t-[28px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-[28px] md:pb-5";

/**
 * Which of the athlete's goals the programme works toward. The goals themselves live in the
 * profile; here they are only ticked — or a new one is written down by its title on the spot.
 */
function GoalPicker({ value, onChange, preselect }: { value: string[]; onChange: (ids: string[]) => void; /** a new programme starts with every open goal ticked */ preselect?: boolean }) {
  const [goals, setGoals] = useState<ProgramGoal[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });
  useEffect(() => {
    let alive = true;
    programGoalsAction().then(
      (list) => {
        if (!alive) return;
        setGoals(list);
        if (preselect) change.current(list.filter((g) => !g.done).map((g) => g.id));
      },
      () => alive && setGoals([]),
    );
    return () => {
      alive = false;
    };
  }, [preselect]);
  const add = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    setRefused(false);
    const goal = await addGoalAction(title).catch(() => null);
    setBusy(false);
    if (!goal) return setRefused(true);
    setGoals((list) => [...(list ?? []), goal]);
    onChange([...value, goal.id]);
    setTitle("");
  };
  // Achieved goals are offered only while they are still ticked.
  const shown = (goals ?? []).filter((g) => !g.done || value.includes(g.id));
  return (
    <div className="space-y-2">
      <div className="text-sm text-ink-2">На які цілі працює програма</div>
      {goals === null ? (
        <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <ul className="space-y-1.5">
          {shown.map((g) => {
            const on = value.includes(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onChange(on ? value.filter((id) => id !== g.id) : [...value, g.id])}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-left"
                >
                  <span className={cx("grid size-5 shrink-0 place-items-center rounded-md", on ? "bg-accent text-accent-ink" : "bg-surface-3")}>{on && <Check size={13} strokeWidth={3.5} />}</span>
                  <span className={cx("min-w-0 flex-1 truncate text-[15px]", !on && "text-ink-2")}>{g.title}</span>
                  {g.targetDate && <span className="shrink-0 text-xs text-muted">до {fmtDate(g.targetDate)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter adds the goal; it must not send the whole programme form.
            e.preventDefault();
            void add();
          }}
          maxLength={140}
          placeholder={shown.length ? "Ще одна ціль" : "Ціль: напр. присід 100 кг"}
          aria-label="Нова ціль"
          className="field min-w-0 flex-1"
        />
        <button type="button" onClick={() => void add()} disabled={busy || !title.trim()} className="btn btn-ghost shrink-0 px-3.5">
          <Plus size={17} /> Додати
        </button>
      </div>
      <p className="text-xs text-muted">
        {refused ? "Не вдалося додати: цілей уже забагато або немає звʼязку." : "Число й дату цілі вкажіть у Профілі — тоді на сторінці програми буде видно прогрес."}
      </p>
    </div>
  );
}

function ProgramFields({ value, onChange, preselect }: { value: Fields; onChange: (v: Fields) => void; preselect?: boolean }) {
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
      {/* What it is for is not typed a second time: the programme points at the goals. */}
      <GoalPicker value={value.goalIds} onChange={(goalIds) => onChange({ ...value, goalIds })} preselect={preselect} />
      <label className="block space-y-1.5">
        <span className="text-sm text-ink-2">Примітки (необовʼязково)</span>
        <textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={2} maxLength={2000} placeholder="Як побудувати, що врахувати: дні, обладнання, обмеження" className="field resize-none text-[15px]" />
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
    return { name: "", description: "", forecast: "", goalIds: [], startsOn: today, endsOn: today ? addDays(today, 27) : "" };
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
            setFields({ name: "", description: "", forecast: "", goalIds: [], startsOn: today, endsOn: addDays(today, 27) });
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
            <ProgramFields value={fields} onChange={setFields} preselect />
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
            {ai && <p className="text-xs text-muted">ШІ розкладе тренування на весь період під вибрані цілі, з огляду на ваші показники й минулі тренування. Порожню програму наповнюєте самі.</p>}
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
