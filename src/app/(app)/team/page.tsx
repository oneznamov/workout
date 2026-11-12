import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Leaderboard, MemberList, PeoplePicker, TeamInvites, TeamLinkCard, TeamName } from "@/components/team";
import { Card, PageHeader, PageSkeleton, SectionTitle, Segmented } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { fmtDate, fmtDuration, fmtNum, plural, SETS_FORMS } from "@/lib/format";
import { getLeaderboard, getMyTeam, getTeamFeed, listMyTeamInvites, listPeople, type BoardPeriod } from "@/lib/team";

export const metadata = { title: "Команда" };

const PERIODS = [
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "all", label: "Увесь час" },
];
const PRIVACY =
  "У команді всі бачать підсумки одне одного: кількість тренувань, час, тоннаж, підходи, кардіо-кілометри, назви й дати тренувань. Вага тіла, показники здоровʼя, цілі, нотатки й деталі підходів лишаються приватними.";

async function Content({ searchParams }: PageProps<"/team">) {
  const sp = await searchParams;
  const period = (PERIODS.some((p) => p.value === sp.p) ? sp.p : "week") as BoardPeriod;
  const user = await getUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const [team, invites, people] = await Promise.all([getMyTeam(user.id), listMyTeamInvites(user.id), listPeople(user.id)]);

  const adminHint = user.isAdmin && (
    <p className="text-xs text-muted">
      Людини ще немає в застосунку?{" "}
      <Link href="/admin" className="text-accent">
        Створіть запрошення
      </Link>{" "}
      — після реєстрації вона одразу потрапить у вашу команду.
    </p>
  );
  const add = (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">Натисніть «Запросити» — людина побачить запрошення в себе в застосунку й підтвердить його.</p>
      <PeoplePicker people={people} />
      <TeamLinkCard origin={origin} activeUntil={team?.linkUntil?.toISOString() ?? null} />
      {adminHint}
    </div>
  );

  if (!team) {
    return (
      <>
        <PageHeader title="Команда" subtitle="Змагайтесь зі своїми: хто більше тренувався цього тижня" />
        <div className="max-w-3xl space-y-4">
          <TeamInvites invites={invites} currentTeam={null} />
          <Card title="Зберіть команду">{add}</Card>
          <p className="text-xs text-muted">{PRIVACY}</p>
        </div>
      </>
    );
  }

  const [board, feed] = await Promise.all([getLeaderboard(user.id, period), getTeamFeed(user.id)]);
  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            Команда · {team.members.length} {team.members.length === 1 ? "учасник" : team.members.length < 5 ? "учасники" : "учасників"}
          </p>
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight">
            <TeamName name={team.name} editable={team.isCaptain} />
          </h1>
        </div>
        <div className="flex w-full sm:w-auto">
          <Segmented options={PERIODS} current={period} param="p" />
        </div>
      </header>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {invites.length > 0 && (
          <div className="lg:col-span-2">
            <TeamInvites invites={invites} currentTeam={team.name} />
          </div>
        )}
        <Card title="Рейтинг">
          <Leaderboard key={period} rows={board} />
          {team.pending.length > 0 && <p className="mt-3 text-xs text-muted">Чекаємо підтвердження: {team.pending.map((p) => p.name).join(", ")}.</p>}
        </Card>

        <section>
          <SectionTitle>Що нового в команді</SectionTitle>
          <div className="card divide-y divide-line">
            {feed.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">
                {team.members.length > 1 ? "Інші учасники ще не завершували тренувань." : "Поки ви тут самі — запросіть когось нижче."}
              </p>
            )}
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

        <Card title="Додати в команду">{add}</Card>

        <Card title="Учасники">
          <MemberList members={team.members} isCaptain={team.isCaptain} />
          <p className="mt-3 text-xs text-muted">{PRIVACY}</p>
        </Card>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/team">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
