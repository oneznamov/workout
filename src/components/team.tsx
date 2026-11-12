"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Crown, Link2, LogOut, Pencil, Share2, UserMinus, UserPlus, X } from "lucide-react";
import {
  cancelTeamInviteAction,
  createTeamLinkAction,
  inviteToTeamAction,
  joinTeamByLinkAction,
  leaveTeamAction,
  removeFromTeamAction,
  renameTeamAction,
  respondTeamInviteAction,
  revokeTeamLinkAction,
  type TeamResult,
} from "@/lib/actions";
import { cx, fmtDate, fmtNum } from "@/lib/format";
import { BOARD_METRICS, rank, type BoardMetric, type BoardRow } from "@/lib/team-logic";
import { CopyField } from "./settings";

const PLACE_TONE = ["bg-accent text-accent-ink", "bg-ink-2 text-black", "bg-activity text-black"];

/** Ranked list for one metric at a time; tap a chip to switch what is being compared. */
export function Leaderboard({ rows, initial = "workouts", compact }: { rows: BoardRow[]; initial?: BoardMetric; compact?: boolean }) {
  const [metric, setMetric] = useState<BoardMetric>(initial);
  const info = BOARD_METRICS.find((m) => m.key === metric)!;
  const ranked = rank(rows, metric);
  const max = Math.max(1, ...ranked.map((r) => r.value));
  return (
    <div>
      {!compact && (
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Показник">
          {BOARD_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              aria-pressed={metric === m.key}
              className={cx(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
                metric === m.key ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <ol className="space-y-1.5">
        {ranked.map((r) => (
          <li key={r.userId} className={cx("flex items-center gap-3 rounded-2xl px-2.5 py-2", r.me && "bg-surface-2")}>
            <span
              className={cx(
                "num grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                r.value > 0 && r.place <= 3 ? PLACE_TONE[r.place - 1] : "bg-surface-2 text-muted",
              )}
              aria-label={`Місце ${r.place}`}
            >
              {r.place}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">
                  {r.name}
                  {r.me && <span className="ml-1.5 text-xs font-medium text-muted">ви</span>}
                </span>
                <span className="num shrink-0 text-[17px] font-semibold">
                  {fmtNum(r.value, info.digits)}
                  {info.unit && <span className="ml-1 text-xs font-medium text-muted">{info.unit}</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${r.value > 0 ? Math.max(3, (r.value / max) * 100) : 0}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const Avatar = ({ name, tone = "bg-surface-2" }: { name: string; tone?: string }) => (
  <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold uppercase", tone)}>{name.slice(0, 1)}</span>
);

/** Runs a team change, shows a refusal if there is one, then reloads what the server knows. */
function useTeamChange() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<TeamResult | void>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.error) setError(r.error);
      router.refresh();
    });
  return { pending, error, run };
}

const ErrorLine = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="text-sm text-critical">
      {error}
    </p>
  ) : null;

/** Invitations waiting for an answer: join or decline, right here. */
export function TeamInvites({ invites, currentTeam }: { invites: { id: string; teamName: string; by: string; members: string[] }[]; currentTeam: string | null }) {
  const { pending, error, run } = useTeamChange();
  if (invites.length === 0) return null;
  return (
    <div className="space-y-3">
      {invites.map((i) => (
        <section key={i.id} className="rounded-[20px] bg-accent/12 p-4 ring-1 ring-accent/40">
          <p className="caps text-accent">Запрошення в команду</p>
          <h2 className="mt-0.5 text-xl font-bold">{i.teamName}</h2>
          <p className="mt-1 text-sm text-ink-2">
            Запрошує {i.by}. У команді: {i.members.join(", ")}. Ви бачитимете підсумки тренувань одне одного в рейтингу.
            {currentTeam && ` Ви перейдете сюди з команди «${currentTeam}».`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button disabled={pending} onClick={() => run(() => respondTeamInviteAction(i.id, true))} className="btn btn-primary">
              <Check size={17} strokeWidth={3} /> Приєднатись
            </button>
            <button disabled={pending} onClick={() => run(() => respondTeamInviteAction(i.id, false))} className="btn btn-ghost">
              Відхилити
            </button>
          </div>
        </section>
      ))}
      <ErrorLine error={error} />
    </div>
  );
}

export type Person = { id: string; name: string; status: "member" | "invited" | "free"; otherTeam: string | null; invitesMe: boolean };

/** Everyone registered in the app: one tap sends an invitation they confirm on their side. */
export function PeoplePicker({ people }: { people: Person[] }) {
  const { pending, error, run } = useTeamChange();
  const others = people.filter((p) => p.status !== "member");
  if (others.length === 0) return <p className="text-sm text-muted">Усі, хто зареєстрований у застосунку, вже у вашій команді.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line">
        {others.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={p.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted">
                {p.status === "invited"
                  ? "Запрошено — чекаємо підтвердження"
                  : p.invitesMe
                    ? `Запрошує вас у «${p.otherTeam}» — відповідь угорі`
                    : p.otherTeam
                      ? `Зараз у команді «${p.otherTeam}»`
                      : "Без команди"}
              </span>
            </span>
            {p.status === "invited" ? (
              <button disabled={pending} onClick={() => run(() => cancelTeamInviteAction(p.id))} className="btn btn-ghost btn-sm">
                <X size={15} /> Скасувати
              </button>
            ) : p.invitesMe ? null : (
              <button disabled={pending} onClick={() => run(() => inviteToTeamAction(p.id))} className="btn btn-primary btn-sm">
                <UserPlus size={15} /> Запросити
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
    </div>
  );
}

type Member = { id: string; name: string; captain: boolean; me: boolean };

export function MemberList({ members, isCaptain }: { members: Member[]; isCaptain: boolean }) {
  const { pending, error, run } = useTeamChange();
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={m.name} tone={m.me ? "bg-accent text-accent-ink" : "bg-surface-2"} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
              {m.name}
              {m.me && <span className="ml-1.5 text-xs text-muted">ви</span>}
            </span>
            {m.captain && (
              <span className="flex items-center gap-1 text-xs font-medium text-activity">
                <Crown size={14} /> капітан
              </span>
            )}
            {isCaptain && !m.me && (
              <button
                aria-label={`Прибрати з команди: ${m.name}`}
                disabled={pending}
                onClick={() => window.confirm(`Прибрати «${m.name}» з команди?`) && run(() => removeFromTeamAction(m.id))}
                className="icon-btn size-9 hover:text-critical"
              >
                <UserMinus size={17} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        disabled={pending}
        onClick={() =>
          window.confirm(members.length > 1 ? "Вийти з команди? Ви перестанете бачити результати одне одного." : "Розпустити команду?") && run(() => leaveTeamAction())
        }
        className="btn btn-danger btn-sm"
      >
        <LogOut size={15} /> {members.length > 1 ? "Вийти з команди" : "Розпустити команду"}
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** The captain can rename the team in place. */
export function TeamName({ name, editable }: { name: string; editable: boolean }) {
  const { pending, error, run } = useTeamChange();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate">{name}</span>
        {editable && (
          <button onClick={() => setEditing(true)} aria-label="Перейменувати команду" className="icon-btn size-9">
            <Pencil size={16} />
          </button>
        )}
      </span>
    );
  }
  return (
    <form
      className="flex min-w-0 flex-wrap items-center gap-2 text-base font-normal tracking-normal"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await renameTeamAction(value);
          if (!r.error) setEditing(false);
          return r;
        });
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} autoFocus aria-label="Назва команди" className="field w-56 py-2" />
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        Зберегти
      </button>
      <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
        Скасувати
      </button>
      <ErrorLine error={error} />
    </form>
  );
}

/** Join link for those who prefer a message in a chat: one tap to create, then copy or share. */
export function TeamLinkCard({ origin, activeUntil }: { origin: string; activeUntil: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Або надішліть посилання: хто відкриє його й натисне «Приєднатись», одразу потрапить у команду. Діє 14 днів.</p>
      {link ? (
        <div className="space-y-2 rounded-2xl bg-accent/10 p-3">
          <CopyField value={link} label="Посилання в команду" />
          {canShare && (
            <button onClick={() => void navigator.share({ title: "Workout", text: "Приєднуйся до моєї команди у Workout", url: link }).catch(() => undefined)} className="btn btn-ghost w-full">
              <Share2 size={17} /> Поділитися
            </button>
          )}
        </div>
      ) : (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const token = await createTeamLinkAction();
              setLink(`${origin}/team/join/${token}`);
              router.refresh();
            })
          }
          className="btn btn-ghost btn-sm"
        >
          <Link2 size={15} /> {activeUntil ? "Створити нове посилання" : "Створити посилання"}
        </button>
      )}
      {activeUntil && !link && (
        <p className="text-xs text-muted">
          Попереднє посилання діє до {fmtDate(activeUntil)}. Нове замінить його.{" "}
          <button
            onClick={() =>
              start(async () => {
                await revokeTeamLinkAction();
                router.refresh();
              })
            }
            className="text-accent"
          >
            Вимкнути
          </button>
        </p>
      )}
    </div>
  );
}

export function JoinTeamButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinTeamByLinkAction(token);
            if (r?.error) setError(r.error);
          })
        }
        className="btn btn-primary w-full"
      >
        <UserPlus size={18} /> {pending ? "Приєднуюсь…" : "Приєднатись до команди"}
      </button>
      <ErrorLine error={error} />
    </>
  );
}
