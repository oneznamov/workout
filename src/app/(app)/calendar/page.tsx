import { Suspense } from "react";
import Link from "next/link";
import { CalendarView, type DayItems } from "@/components/calendar";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { getUserId } from "@/lib/auth";
import { isDay, isMonth, monthGrid } from "@/lib/calendar-logic";
import { listCardio } from "@/lib/cardio";
import { addDays, dayOf } from "@/lib/format";
import { listWorkouts } from "@/lib/workouts";
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
  const from = grid[0];
  const to = grid[41];
  // A day either side: the list filters by UTC days, the calendar shows local ones.
  const [workouts, cardio] = await Promise.all([
    listWorkouts(userId, { status: ["completed", "planned", "in_progress"], from: addDays(from, -1), to: addDays(to, 1), limit: 400 }),
    listCardio(userId, { from: addDays(from, -1), to: addDays(to, 1) }),
  ]);
  const days: Record<string, DayItems> = {};
  const at = (day: string) => (days[day] ??= { workouts: [], cardio: [] });
  for (const w of [...workouts].reverse()) {
    const day = w.status === "planned" ? w.scheduledFor : w.startedAt ? dayOf(w.startedAt) : w.scheduledFor;
    if (day && day >= from && day <= to) at(day).workouts.push(w);
  }
  for (const c of [...cardio].reverse()) {
    const day = dayOf(c.startAt);
    // A watch session that belongs to a diary workout is already shown with that workout.
    if (day >= from && day <= to && !c.workoutId) at(day).cardio.push(c);
  }
  // Open on the asked day, else today when it is in view, else the first of the month.
  const initialDay = picked && picked >= from && picked <= to ? picked : today.slice(0, 7) === month ? today : `${month}-01`;
  return (
    <>
      <PageHeader title="Календар" subtitle={BACK} />
      <CalendarView key={`${month}:${initialDay}`} month={month} today={today} initialDay={initialDay} days={days} />
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
