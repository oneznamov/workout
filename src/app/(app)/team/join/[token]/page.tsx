import { Suspense } from "react";
import Link from "next/link";
import { JoinTeamButton } from "@/components/team";
import { PageSkeleton } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { findTeamLink, getMyTeam } from "@/lib/team";

export const metadata = { title: "Приєднатись до команди" };

async function Content({ params }: PageProps<"/team/join/[token]">) {
  const { token } = await params;
  const user = await getUser();
  const [target, mine] = await Promise.all([findTeamLink(token), getMyTeam(user.id)]);
  const back = (
    <Link href="/team" className="btn btn-ghost w-full">
      До команди
    </Link>
  );

  if (!target) {
    return (
      <div className="card mx-auto max-w-md space-y-3 p-5">
        <p className="text-[15px]">Це посилання вже не працює: минув термін дії або його вимкнули.</p>
        <p className="text-sm text-muted">Попросіть надіслати нове — або нехай вас запросять прямо в застосунку.</p>
        {back}
      </div>
    );
  }
  const already = mine?.id === target.id;
  return (
    <div className="card mx-auto max-w-md space-y-4 p-5">
      <div>
        <p className="caps text-accent">{already ? "Ви вже в цій команді" : "Запрошення в команду"}</p>
        <h1 className="text-2xl font-bold">{target.name}</h1>
        <p className="mt-1 text-sm text-muted">Учасники: {target.members.map((m) => m.name).join(", ")}</p>
      </div>
      {already ? (
        back
      ) : (
        <>
          <p className="text-sm text-ink-2">
            У команді всі бачать підсумки одне одного: кількість тренувань, час, тоннаж, підходи, кардіо-кілометри, назви й дати тренувань.
            Вага тіла, показники здоровʼя, цілі й нотатки лишаються приватними. Вийти можна будь-коли.
            {mine && ` Ви перейдете сюди з команди «${mine.name}».`}
          </p>
          <JoinTeamButton token={token} />
          <Link href="/" className="btn btn-ghost w-full">
            Не зараз
          </Link>
        </>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/team/join/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
