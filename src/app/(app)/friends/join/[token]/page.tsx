import { Suspense } from "react";
import Link from "next/link";
import { AcceptFriendButton } from "@/components/friends";
import { PageSkeleton } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { findFriendLink, listFriends } from "@/lib/friends";

export const metadata = { title: "Додати в друзі" };

async function Content({ params }: PageProps<"/friends/join/[token]">) {
  const { token } = await params;
  const user = await getUser();
  const owner = await findFriendLink(token);
  const back = (
    <Link href="/friends" className="btn btn-ghost w-full">
      До друзів
    </Link>
  );

  if (!owner) {
    return (
      <div className="card mx-auto max-w-md space-y-3 p-5">
        <p className="text-[15px]">Це посилання вже не працює: минув термін дії або його вимкнули.</p>
        <p className="text-sm text-muted">Попросіть друга надіслати нове.</p>
        {back}
      </div>
    );
  }
  if (owner.userId === user.id) {
    return (
      <div className="card mx-auto max-w-md space-y-3 p-5">
        <p className="text-[15px]">Це ваше власне посилання — надішліть його другові.</p>
        {back}
      </div>
    );
  }
  const already = (await listFriends(user.id)).some((f) => f.id === owner.userId);
  return (
    <div className="card mx-auto max-w-md space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-accent-ink uppercase">{owner.name.slice(0, 1)}</span>
        <div>
          <h1 className="text-xl font-bold">{owner.name}</h1>
          <p className="text-sm text-muted">{already ? "Ви вже друзі" : "пропонує дружити у Workout"}</p>
        </div>
      </div>
      {already ? (
        back
      ) : (
        <>
          <p className="text-sm text-ink-2">
            Ви бачитимете підсумки одне одного: кількість тренувань, час, тоннаж, підходи, кардіо-кілометри, назви й дати тренувань.
            Вага тіла, показники здоровʼя, нотатки й деталі підходів лишаються приватними. Прибрати з друзів можна будь-коли.
          </p>
          <AcceptFriendButton token={token} name={owner.name} />
          <Link href="/" className="btn btn-ghost w-full">
            Не зараз
          </Link>
        </>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/friends/join/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
