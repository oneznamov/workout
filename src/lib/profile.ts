/** Private goals and notes about the athlete. Pure helpers — used on the server, in the browser and in tests. */

/** What a goal is measured by: body weight, one tape measurement, or the heaviest set of an exercise. */
export type GoalMetric = { kind: "body_mass" } | { kind: "measure"; key: string } | { kind: "exercise"; exerciseId: string; name: string };
export type Goal = {
  id: string;
  title: string;
  details: string;
  targetDate: string | null;
  done: boolean;
  /** Optional: makes the goal measurable. `start` is the value when tracking began. */
  metric: GoalMetric | null;
  target: number | null;
  start: number | null;
};
export type Sex = "male" | "female";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Profile = {
  about: string;
  goals: Goal[];
  sex: Sex | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  heightCm: number | null;
  experience: Experience | null;
};

export const EMPTY_PROFILE: Profile = { about: "", goals: [], sex: null, birthDate: null, heightCm: null, experience: null };
export const SEX_LABEL: Record<Sex, string> = { male: "Чоловік", female: "Жінка" };
export const EXPERIENCE_LABEL: Record<Experience, string> = {
  beginner: "Новачок — до року",
  intermediate: "Середній — 1–3 роки",
  advanced: "Досвідчений — 3+ роки",
};

/** Full years between a birth date and a day (both YYYY-MM-DD). */
export function ageOn(birthDate: string | null, day: string): number | null {
  if (!birthDate) return null;
  const years = Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (day.slice(5) < birthDate.slice(5) ? 1 : 0);
  return years >= 0 && years < 120 ? years : null;
}
export const PROFILE_LIMITS = { about: 2000, title: 140, details: 600, goals: 12 };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function goalMetric(raw: unknown): GoalMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.kind === "body_mass") return { kind: "body_mass" };
  if (m.kind === "measure" && typeof m.key === "string" && /^m_[a-z]+$/.test(m.key)) return { kind: "measure", key: m.key };
  if (m.kind === "exercise" && typeof m.exerciseId === "string" && m.exerciseId) return { kind: "exercise", exerciseId: m.exerciseId, name: text(m.name, 80) };
  return null;
}

/** How far a measurable goal has come: 0…1 from where it started to its target (works both for "more" and for "less"). */
export function goalFraction(start: number | null, current: number | null, target: number | null): number | null {
  if (current == null || target == null) return null;
  if (start == null || start === target) return current === target ? 1 : null;
  return Math.min(1, Math.max(0, (current - start) / (target - start)));
}

/** Cleans whatever came from a form, the database or an agent into a well-formed profile. */
export function normalizeProfile(input: unknown): Profile {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const goals: Goal[] = [];
  for (const raw of Array.isArray(src.goals) ? src.goals : []) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    // Whatever the person wrote counts: a goal typed only into "details" is still a goal.
    const written = text(g.details, PROFILE_LIMITS.details);
    const title = text(g.title, PROFILE_LIMITS.title) || written.slice(0, PROFILE_LIMITS.title);
    if (!title) continue;
    const details = written === title ? "" : written;
    let id = text(g.id, 64);
    if (!id || seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    const date = text(g.targetDate ?? g.target_date, 10);
    const metric = goalMetric(g.metric);
    const target = Number(g.target);
    const start = Number(g.start);
    goals.push({
      id,
      title,
      details,
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      done: g.done === true,
      metric: metric && Number.isFinite(target) && target > 0 ? metric : null,
      target: metric && Number.isFinite(target) && target > 0 ? Math.round(target * 10) / 10 : null,
      start: metric && g.start != null && Number.isFinite(start) ? Math.round(start * 10) / 10 : null,
    });
    if (goals.length >= PROFILE_LIMITS.goals) break;
  }
  const birth = text(src.birthDate ?? src.birth_date, 10);
  const height = Number(src.heightCm ?? src.height_cm);
  return {
    about: text(src.about, PROFILE_LIMITS.about),
    goals,
    sex: src.sex === "male" || src.sex === "female" ? src.sex : null,
    birthDate: /^(19|20)\d{2}-\d{2}-\d{2}$/.test(birth) ? birth : null,
    heightCm: Number.isFinite(height) && height >= 100 && height <= 250 ? Math.round(height) : null,
    experience: src.experience === "beginner" || src.experience === "intermediate" || src.experience === "advanced" ? src.experience : null,
  };
}

/** The profile as plain text for a prompt. */
export function profileText(p: Profile): string {
  const lines: string[] = [];
  const open = p.goals.filter((g) => !g.done);
  const done = p.goals.filter((g) => g.done);
  lines.push(open.length ? "Goals:" : "Goals: none written down yet.");
  for (const g of open) lines.push(`- ${g.title}${g.targetDate ? ` (by ${g.targetDate})` : ""}${g.details ? ` — ${g.details}` : ""}`);
  if (done.length) lines.push(`Already achieved: ${done.map((g) => g.title).join("; ")}`);
  if (p.about) lines.push(`About the athlete (their own words): ${p.about}`);
  return lines.join("\n");
}
