import { createHash } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarView } from "@/components/calendar";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getUserId } from "@/lib/auth";
import { getCalendarDays } from "@/lib/calendar";
import { isDay, isMonth, monthGrid } from "@/lib/calendar-logic";
import { dayOf } from "@/lib/format";
import { redirect } from "next/navigation";

export const metadata = { title: "Календар" };

const BACK = (
  <Link href="/workouts" className="text-accent">
    ← Тренування
  </Link>
);

async function Content({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const today = dayOf();
  const picked = isDay(sp.d) ? sp.d : null;
  const month = isMonth(sp.m) ? sp.m : (picked ?? today).slice(0, 7);
  const grid = monthGrid(month);
  const days = await getCalendarDays(userId, month);
  // Open on the asked day, else today when it is in view, else the first of the month.
  const initialDay = picked && picked >= grid[0] && picked <= grid[41] ? picked : today.slice(0, 7) === month ? today : `${month}-01`;
  // The view keeps the months it has looked at; when anything on this one changes (a workout
  // planned, moved or finished) it starts over with fresh data.
  const stamp = createHash("sha1")
    .update(Object.entries(days).map(([d, i]) => `${d}:${i.workouts.map((w) => `${w.id}${w.status}`).join()}:${i.cardio.map((c) => c.id).join()}`).join("|"))
    .digest("base64url")
    .slice(0, 10);
  return (
    <>
      <PageHeader title="Календар" subtitle={BACK} />
      <CalendarView key={`${month}:${initialDay}:${stamp}`} month={month} today={today} initialDay={initialDay} days={days} />
    </>
  );
}

export default function Page(props: PageProps<"/calendar">) {
  return (
    <Suspense fallback={<PageSkeleton title="Календар" subtitle={BACK} />}>
      <Content {...props} />
    </Suspense>
  );
}
