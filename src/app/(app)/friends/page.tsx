import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { FriendLinkCard, FriendList, Leaderboard } from "@/components/friends";
import { Card, Disclosure, PageHeader, PageSkeleton, SectionTitle, Segmented } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { fmtDate, fmtDuration, fmtNum, plural, SETS_FORMS } from "@/lib/format";
import { getFriendLinkInfo, getFriendsFeed, getLeaderboard, listFriends, type BoardPeriod } from "@/lib/friends";

export const metadata = { title: "Друзі" };

const PERIODS = [
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "all", label: "Увесь час" },
];

async function Content({ searchParams }: PageProps<"/friends">) {
  const sp = await searchParams;
  const period = (PERIODS.some((p) => p.value === sp.p) ? sp.p : "week") as BoardPeriod;
  const user = await getUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const [friends, board, feed, link] = await Promise.all([
    listFriends(user.id),
    getLeaderboard(user.id, period),
    getFriendsFeed(user.id),
    getFriendLinkInfo(user.id),
  ]);
  const add = <FriendLinkCard origin={origin} activeUntil={link?.expiresAt.toISOString() ?? null} />;

  if (friends.length === 0) {
    return (
      <>
        <PageHeader title="Друзі" subtitle="Змагайтесь із близькими: хто більше тренувався цього тижня" />
        <div className="max-w-3xl space-y-4">
          <Card title="Додати першого друга">{add}</Card>
          {user.isAdmin && (
            <Link href="/admin" className="card flex items-center justify-between gap-3 p-4 hover:bg-surface-2">
              <span>
                <span className="block text-[15px] font-semibold">Друг ще не має акаунта?</span>
                <span className="block text-xs text-muted">Створіть запрошення — після реєстрації ви одразу станете друзями</span>
              </span>
              <span className="text-accent">→</span>
            </Link>
          )}
          <p className="text-xs text-muted">
            Друзі бачать лише підсумки: кількість тренувань, час, тоннаж, підходи, кардіо-кілометри, а також назви й дати тренувань.
            Вага тіла, показники здоровʼя, нотатки й деталі підходів лишаються приватними.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Друзі" subtitle={`Рейтинг серед ${friends.length + 1}`} actions={<Segmented options={PERIODS} current={period} param="p" />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <Card title="Рейтинг">
          <Leaderboard key={period} rows={board} />
        </Card>

        <section>
          <SectionTitle>Що нового у друзів</SectionTitle>
          <div className="card divide-y divide-line">
            {feed.length === 0 && <p className="p-6 text-center text-sm text-muted">Друзі ще не завершували тренувань.</p>}
            {feed.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-strength/20 text-sm font-bold text-strength uppercase">{f.who.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">
                    <span className="font-semibold">{f.who}</span> <span className="text-ink-2">· {f.name}</span>
                  </div>
                  <div className="tabular truncate text-xs text-muted">
                    {fmtDate(f.startedAt, { weekday: "short", day: "numeric", month: "short" })}
                    {f.activeSec != null && ` · ${fmtDuration(f.activeSec)}`} · {plural(f.sets, SETS_FORMS)}
                    {f.volume > 0 && ` · ${fmtNum(f.volume)} кг`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Disclosure title="Додати друга" hint="Посилання, яке можна кинути в чат">
          {add}
          {user.isAdmin && (
            <p className="mt-3 text-xs text-muted">
              Друг ще без акаунта?{" "}
              <Link href="/admin" className="text-accent">
                Створіть запрошення
              </Link>{" "}
              — після реєстрації ви одразу станете друзями.
            </p>
          )}
        </Disclosure>

        <Disclosure title={`Мої друзі · ${friends.length}`} hint="Друзі бачать лише підсумки тренувань">
          <FriendList friends={friends} />
          <p className="mt-3 text-xs text-muted">
            Друзі бачать кількість тренувань, час, тоннаж, підходи, кардіо-кілометри, назви й дати тренувань. Вага тіла, показники
            здоровʼя, нотатки й деталі підходів лишаються приватними.
          </p>
        </Disclosure>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/friends">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
