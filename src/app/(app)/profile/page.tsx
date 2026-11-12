import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import Link from "next/link";
import { Activity, AlertTriangle, Droplet, Flame, Footprints, Heart, Moon, PersonStanding, Ruler, Scale, Sparkles, Target, Thermometer, Timer, TrendingUp, UserRound, Wind } from "lucide-react";
import { TrendChart } from "@/components/charts";
import { DeleteMetricButton, WeightForm } from "@/components/metric-form";
import { GoalsEditor, MeasurementsForm, PersonForm, SickMode, type MeasureState } from "@/components/profile";
import { Card, Disclosure, PageHeader, Segmented } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { addDays, dayOf, fmtDate, fmtDuration, fmtNum, fmtTime } from "@/lib/format";
import { getMetricSeries, listAvailableMetrics, listHealthWorkouts } from "@/lib/health";
import { METRIC_INFO } from "@/lib/labels";
import { MEASURE_KEYS } from "@/lib/measurements";
import { ageOn, EXPERIENCE_LABEL, normalizeProfile, SEX_LABEL } from "@/lib/profile";
import { notableVitals } from "@/lib/vitals";
import { goalProgress } from "@/lib/goal-progress";
import { listExercises } from "@/lib/workouts";

export const metadata = { title: "Профіль" };

const PERIODS = [
  { value: "30", label: "30 дн" },
  { value: "90", label: "90 дн" },
  { value: "180", label: "Півроку" },
  { value: "365", label: "Рік" },
];
const BODY = ["body_mass", "body_fat_percentage", "lean_body_mass"];
const COLOR: Record<string, string> = {
  body_mass: "var(--c-body)",
  body_fat_percentage: "var(--c-body)",
  resting_heart_rate: "var(--c-heart)",
  heart_rate_variability: "var(--c-heart)",
  walking_heart_rate_average: "var(--c-heart)",
  vo2_max: "var(--c-cycle)",
  respiratory_rate: "var(--c-cycle)",
  blood_oxygen_saturation: "var(--c-cycle)",
  sleep_analysis: "var(--c-sleep)",
};
const TONE: Record<string, string> = {
  "var(--c-body)": "text-body",
  "var(--c-heart)": "text-heart",
  "var(--c-cycle)": "text-cycle",
  "var(--c-sleep)": "text-sleep",
  "var(--c-activity)": "text-activity",
};
const colorOf = (metric: string) => COLOR[metric] ?? "var(--c-activity)";
const ICON: Record<string, typeof Heart> = {
  resting_heart_rate: Heart,
  walking_heart_rate_average: Heart,
  heart_rate_variability: Activity,
  vo2_max: Wind,
  respiratory_rate: Wind,
  blood_oxygen_saturation: Droplet,
  sleep_analysis: Moon,
  step_count: Footprints,
  walking_running_distance: Footprints,
  active_energy: Flame,
  basal_energy_burned: Flame,
  apple_exercise_time: Timer,
  apple_stand_time: PersonStanding,
  flights_climbed: TrendingUp,
};

const ORDER = [
  "resting_heart_rate",
  "heart_rate_variability",
  "vo2_max",
  "sleep_analysis",
  "step_count",
  "active_energy",
  "apple_exercise_time",
  "walking_running_distance",
  "walking_heart_rate_average",
  "respiratory_rate",
  "blood_oxygen_saturation",
  "basal_energy_burned",
  "apple_stand_time",
  "flights_climbed",
];

async function Content({ searchParams }: PageProps<"/profile">) {
  const sp = await searchParams;
  const days = PERIODS.some((p) => p.value === sp.d) ? Number(sp.d) : 90;
  const user = await getUser();
  const userId = user.id;
  const profile = normalizeProfile(user.profile);
  const today = dayOf();
  const from = addDays(today, -days);

  const available = await listAvailableMetrics(userId);
  const watchMetrics = ORDER.filter((m) => available.some((a) => a.metric === m));
  const [series, recentVitals, measures, watchWorkouts, progress, exercises] = await Promise.all([
    getMetricSeries(userId, [...BODY, ...watchMetrics], from),
    getMetricSeries(userId, watchMetrics, addDays(today, -28)),
    getMetricSeries(userId, MEASURE_KEYS),
    listHealthWorkouts(userId, { limit: 15 }),
    goalProgress(userId, profile),
    listExercises(userId),
  ]);
  const of = (metric: string) => series.filter((s) => s.metric === metric);
  const points = (metric: string) =>
    of(metric).map((s) => ({
      label: fmtDate(s.day),
      value: s.value,
      hint: fmtDate(s.day, { day: "numeric", month: "long", year: "numeric" }),
    }));

  const weights = of("body_mass");
  const lastWeight = weights.at(-1);
  const firstWeight = weights[0];
  const change = lastWeight && firstWeight && weights.length > 1 ? lastWeight.value - firstWeight.value : null;

  // Latest tape measurement of each kind, with the one before it for the difference.
  const latest: MeasureState = {};
  for (const key of MEASURE_KEYS) {
    const rows = measures.filter((m) => m.metric === key);
    if (rows.length) latest[key] = { value: rows.at(-1)!.value, day: rows.at(-1)!.day, previous: rows.at(-2)?.value ?? null };
  }

  const notes = notableVitals(recentVitals, today);
  const age = ageOn(profile.birthDate, today);
  const bmi = lastWeight && profile.heightCm ? lastWeight.value / (profile.heightCm / 100) ** 2 : null;
  const facts = [
    profile.sex && SEX_LABEL[profile.sex],
    age != null && `${age} р.`,
    profile.heightCm && `${profile.heightCm} см`,
    lastWeight && `${fmtNum(lastWeight.value, 1)} кг`,
    bmi && `ІМТ ${fmtNum(bmi, 1)}`,
    profile.experience && EXPERIENCE_LABEL[profile.experience].split(" — ")[0].toLowerCase(),
  ].filter(Boolean);

  const metricCard = (m: string, note?: (typeof notes)[number]) => {
    const info = METRIC_INFO[m];
    const data = points(m);
    const vals = data.map((d) => d.value);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const Icon = ICON[m] ?? Activity;
    return (
      <Card key={m} title={info.label} tone={TONE[colorOf(m)]} icon={<Icon size={16} />}>
        {note ? (
          <div className="mb-3">
            <div className="num text-[1.75rem] leading-none font-semibold">
              {fmtNum(note.recent, info.digits)}
              {info.unit && <span className="ml-1 text-sm font-medium text-muted">{info.unit}</span>}
              <span className="ml-2 text-xs font-normal text-muted">за тиждень</span>
            </div>
            <p className={`mt-2 flex items-start gap-1.5 text-sm ${note.status === "attention" ? "text-warning" : "text-good"}`}>
              {note.status === "attention" ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <Sparkles size={15} className="mt-0.5 shrink-0" />}
              {note.text}
            </p>
          </div>
        ) : (
          avg != null && (
            <div className="mb-2">
              <div className="caps">У середньому</div>
              <div className="num text-[1.75rem] leading-none font-semibold">
                {fmtNum(avg, info.digits)}
                {info.unit && <span className="ml-1 text-sm font-medium text-muted">{info.unit}</span>}
              </div>
            </div>
          )
        )}
        <TrendChart data={data} kind={info.agg === "sum" ? "bar" : "line"} unit={info.unit} digits={info.digits} color={colorOf(m)} />
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Профіль"
        subtitle={<span className="block truncate">{facts.length ? facts.join(" · ") : "Розкажіть про себе — аналіз стане точнішим"}</span>}
        actions={<Segmented options={PERIODS} current={String(days)} param="d" label="Період графіків" />}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <Card title="Самопочуття" icon={<Thermometer size={16} />}>
            <SickMode sick={profile.sick} today={today} />
          </Card>

          <Card title="Про мене" icon={<UserRound size={16} />}>
            <p className="mb-4 text-sm text-ink-2">
              Ці дані бачите лише ви, Claude та вбудований ШІ: за ними підбираються навантаження, оцінюється прогрес і малюється фігура на
              карті мʼязів.
            </p>
            <PersonForm initial={profile} />
          </Card>

          <Card title="Цілі" icon={<Target size={16} />}>
            <GoalsEditor initial={profile} progress={progress} exercises={exercises.map((e) => ({ id: e.id, name: e.name }))} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Вага тіла, кг"
            tone="text-body"
            icon={<Scale size={16} />}
            action={
              lastWeight && (
                <span className="text-sm">
                  <span className="num text-lg font-semibold">{fmtNum(lastWeight.value, 1)} кг</span>
                  {change != null && (
                    <span className="ml-2 text-xs text-muted">
                      {change > 0 ? "+" : change < 0 ? "−" : ""}
                      {fmtNum(Math.abs(change), 1)} кг за період
                    </span>
                  )}
                </span>
              )
            }
          >
            <TrendChart data={points("body_mass")} unit="кг" digits={1} height={200} color="var(--c-body)" />
            <div className="mt-4 border-t border-line pt-4">
              <WeightForm today={today} />
            </div>
            {weights.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted">Записи ({weights.length})</summary>
                <ul className="tabular mt-2 grid gap-x-6 text-sm sm:grid-cols-2">
                  {[...weights].reverse().map((w) => (
                    <li key={w.day} className="flex items-center justify-between border-b border-line py-1">
                      <span className="text-ink-2">{fmtDate(w.day, { day: "numeric", month: "short", year: "numeric" })}</span>
                      <span className="flex items-center gap-1">
                        {fmtNum(w.value, 1)} кг
                        <DeleteMetricButton metric="body_mass" day={w.day} />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {of("body_fat_percentage").length > 0 && (
            <Card title="Жир, %" tone="text-body" icon={<Scale size={16} />}>
              <TrendChart data={points("body_fat_percentage")} unit="%" digits={1} color="var(--c-body)" />
            </Card>
          )}

          <Card title="Заміри тіла" tone="text-body" icon={<Ruler size={16} />}>
            <MeasurementsForm today={today} latest={latest} />
          </Card>
        </div>

        {/* From the watch: only what stands out. Everything else is one tap away. */}
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-[1.35rem] font-bold tracking-tight">Показники з Apple Watch</h2>
          {watchMetrics.length === 0 ? (
            <p className="card p-5 text-sm text-muted">
              Даних з Apple Watch ще немає. Налаштуйте синхронізацію Apple Health у{" "}
              <Link href="/settings" className="text-accent">
                налаштуваннях
              </Link>
              .
            </p>
          ) : (
            <>
              {notes.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{notes.map((n) => metricCard(n.metric, n))}</div>
              ) : (
                <p className="card p-5 text-sm text-ink-2">Усі показники в межах вашої звичної норми — нічого, на що варто звернути увагу.</p>
              )}
              <Disclosure title={`Усі показники · ${watchMetrics.length}`} hint="Графіки за вибраний період">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{watchMetrics.filter((m) => !notes.some((n) => n.metric === m)).map((m) => metricCard(m))}</div>
              </Disclosure>
              {watchWorkouts.length > 0 && (
                <Disclosure title="Тренування з Apple Watch" hint="Останні записи з годинника">
                  <ul className="divide-y divide-line">
                    {watchWorkouts.map((h) => (
                      <li key={h.id} className="tabular flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{h.activityType}</span>
                          <span className="block text-xs text-muted">
                            {fmtDate(h.startAt, { day: "numeric", month: "short" })} · {fmtTime(h.startAt)} · {fmtDuration(h.durationSec)}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 text-xs text-ink-2">
                          {h.avgHr != null && <span className="text-heart">♥ {fmtNum(h.avgHr)}</span>}
                          {h.activeKcal != null && <span>{fmtNum(h.activeKcal)} ккал</span>}
                          {h.workoutId ? (
                            <Link href={`/workouts/${h.workoutId}`} className="text-accent">
                              У щоденнику →
                            </Link>
                          ) : (
                            <span className="text-muted">не привʼязано</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/profile">) {
  return (
    <Suspense fallback={<PageSkeleton title="Профіль" />}>
      <Content {...props} />
    </Suspense>
  );
}
