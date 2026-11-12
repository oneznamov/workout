"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Share2, UserMinus, UserPlus } from "lucide-react";
import { acceptFriendLinkAction, createFriendLinkAction, removeFriendAction, revokeFriendLinkAction } from "@/lib/actions";
import { cx, fmtDate, fmtNum } from "@/lib/format";
import { BOARD_METRICS, rank, type BoardMetric, type BoardRow } from "@/lib/friends-logic";
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

/** "Add me" link: one tap to create, then copy or share it into a chat. */
export function FriendLinkCard({ origin, activeUntil }: { origin: string; activeUntil: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Надішліть посилання другові, який уже має акаунт. Він відкриє його, натисне «Додати» — і ви побачите одне одного в рейтингу.
        Посилання діє 14 днів і підходить для кількох людей.
      </p>
      {link ? (
        <div className="space-y-2 rounded-2xl bg-accent/10 p-3">
          <CopyField value={link} label="Посилання для друга" />
          {canShare && (
            <button onClick={() => void navigator.share({ title: "Workout", text: "Додай мене в друзі у Workout", url: link }).catch(() => undefined)} className="btn btn-ghost w-full">
              <Share2 size={17} /> Поділитися
            </button>
          )}
        </div>
      ) : (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const token = await createFriendLinkAction();
              setLink(`${origin}/friends/join/${token}`);
              router.refresh();
            })
          }
          className="btn btn-primary w-full sm:w-auto"
        >
          <Link2 size={17} /> {activeUntil ? "Створити нове посилання" : "Створити посилання"}
        </button>
      )}
      {activeUntil && !link && (
        <p className="text-xs text-muted">
          Попереднє посилання діє до {fmtDate(activeUntil)}. Нове замінить його.{" "}
          <button
            onClick={() =>
              start(async () => {
                await revokeFriendLinkAction();
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

export function FriendList({ friends }: { friends: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (friends.length === 0) return <p className="text-sm text-muted">Поки нікого. Створіть посилання вище й надішліть другові.</p>;
  return (
    <ul className="divide-y divide-line">
      {friends.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold uppercase">{f.name.slice(0, 1)}</span>
            <span className="truncate text-[15px] font-medium">{f.name}</span>
          </span>
          <button
            aria-label={`Прибрати з друзів: ${f.name}`}
            disabled={pending}
            onClick={() =>
              window.confirm(`Прибрати «${f.name}» з друзів? Ви перестанете бачити результати одне одного.`) &&
              start(async () => {
                await removeFriendAction(f.id);
                router.refresh();
              })
            }
            className="icon-btn size-9 hover:text-critical"
          >
            <UserMinus size={17} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AcceptFriendButton({ token, name }: { token: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => acceptFriendLinkAction(token))} className="btn btn-primary w-full">
      <UserPlus size={18} /> {pending ? "Додаю…" : `Додати ${name} в друзі`}
    </button>
  );
}
