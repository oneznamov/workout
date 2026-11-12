"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Link2, Trash2, UserPlus } from "lucide-react";
import { clearErrorsAction, createInviteAction, createResetLinkAction, deleteUserAction, revokeInviteAction } from "@/lib/actions";
import { fmtDate } from "@/lib/format";
import { CopyField } from "./settings";

export type AdminUser = { id: string; username: string; isAdmin: boolean; createdAt: string; workouts: number; lastWorkoutAt: string | null };
export type AdminInvite = {
  id: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  /** still usable: not used and not expired (decided on the server) */
  open: boolean;
};

export function InviteManager({ invites, origin }: { invites: AdminInvite[]; origin: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = invites.filter((i) => i.open);
  const closed = invites.filter((i) => !i.open);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:flex"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const token = await createInviteAction(note);
            setLink(`${origin}/invite/${token}`);
            setNote("");
            router.refresh();
          });
        }}
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Для кого (необовʼязково)" aria-label="Для кого запрошення" className="field min-w-0 flex-1" />
        <button type="submit" disabled={pending} className="btn btn-primary">
          <UserPlus size={17} /> Створити запрошення
        </button>
      </form>

      {link && (
        <div className="space-y-2 rounded-2xl bg-accent/10 p-4">
          <p className="text-sm">Надішліть це посилання людині. Воно одноразове, діє 7 днів і більше не буде показане:</p>
          <CopyField value={link} label="Посилання-запрошення" />
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y divide-line">
          {open.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2.5">
                <Link2 size={17} className="shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{i.note ?? "Запрошення"}</span>
                  <span className="block text-xs text-muted">
                    створено {fmtDate(i.createdAt)} · діє до {fmtDate(i.expiresAt)}
                  </span>
                </span>
              </span>
              <button
                aria-label="Скасувати запрошення"
                onClick={() =>
                  window.confirm("Скасувати це запрошення? Посилання перестане працювати.") &&
                  start(async () => {
                    await revokeInviteAction(i.id);
                    router.refresh();
                  })
                }
                className="icon-btn size-9 hover:text-critical"
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <p className="text-xs text-muted">
          Використані або прострочені:{" "}
          {closed.map((i) => `${i.note ?? "запрошення"}${i.usedBy ? ` → ${i.usedBy}` : i.usedAt ? " → акаунт видалено" : " (прострочене)"}`).join(", ")}
        </p>
      )}
    </div>
  );
}

export function UserList({ users, selfId, origin }: { users: AdminUser[]; selfId: string; origin: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reset, setReset] = useState<{ userId: string; link: string } | null>(null);
  return (
    <ul className="divide-y divide-line">
      {users.map((u) => (
        <li key={u.id} className="py-3">
          <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-medium">{u.username}</span>
              {u.isAdmin && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">адмін</span>}
              {u.id === selfId && <span className="text-xs text-muted">це ви</span>}
            </span>
            <span className="block text-xs text-muted">
              з {fmtDate(u.createdAt, { day: "numeric", month: "short", year: "numeric" })} · тренувань: {u.workouts}
              {u.lastWorkoutAt ? ` · останнє ${fmtDate(u.lastWorkoutAt)}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center">
            <button
              aria-label={`Посилання для нового пароля: ${u.username}`}
              title="Створити посилання для нового пароля"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const token = await createResetLinkAction(u.id);
                  setReset({ userId: u.id, link: `${origin}/reset/${token}` });
                })
              }
              className="icon-btn size-9"
            >
              <KeyRound size={17} />
            </button>
          {!u.isAdmin && (
            <button
              aria-label={`Видалити користувача ${u.username}`}
              disabled={pending}
              onClick={() =>
                window.confirm(`Видалити «${u.username}» разом з усіма тренуваннями й даними? Це не можна скасувати.`) &&
                start(async () => {
                  await deleteUserAction(u.id);
                  router.refresh();
                })
              }
              className="icon-btn size-9 hover:text-critical"
            >
              <Trash2 size={17} />
            </button>
          )}
          </span>
          </div>
          {reset?.userId === u.id && (
            <div className="mt-3 space-y-2 rounded-2xl bg-accent/10 p-3">
              <p className="text-sm">
                Посилання для нового пароля — одноразове, діє 24 години, більше не буде показане. Після зміни пароля всі пристрої
                цього акаунта вийдуть із системи.
              </p>
              <CopyField value={reset.link} label="Посилання для нового пароля" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export type AdminError = { id: string; source: string; message: string; detail: string | null; path: string | null; createdAt: string; username: string | null };

export function ErrorList({ errors }: { errors: AdminError[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (errors.length === 0) return <p className="text-sm text-muted">За останній місяць помилок не зафіксовано.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {errors.map((e) => (
          <li key={e.id} className="py-2.5 text-sm">
            <details>
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{e.source === "server" ? "сервер" : "браузер"}</span>
                <span className="break-words">{e.message}</span>
                <span className="block text-xs text-muted">
                  {fmtDate(e.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {e.path ? ` · ${e.path}` : ""}
                  {e.username ? ` · ${e.username}` : ""}
                </span>
              </summary>
              {e.detail && <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-plane p-3 font-mono text-[11px] whitespace-pre-wrap text-ink-2">{e.detail}</pre>}
            </details>
          </li>
        ))}
      </ul>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await clearErrorsAction();
            router.refresh();
          })
        }
        className="btn btn-sm btn-ghost"
      >
        Очистити список
      </button>
    </div>
  );
}
