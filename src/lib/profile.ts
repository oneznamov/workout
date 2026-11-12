/** Private goals and notes about the athlete. Pure helpers — used on the server, in the browser and in tests. */

export type Goal = { id: string; title: string; details: string; targetDate: string | null; done: boolean };
export type Profile = { about: string; goals: Goal[] };

export const EMPTY_PROFILE: Profile = { about: "", goals: [] };
export const PROFILE_LIMITS = { about: 2000, title: 140, details: 600, goals: 12 };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Cleans whatever came from a form, the database or an agent into a well-formed profile. */
export function normalizeProfile(input: unknown): Profile {
  const src = (input && typeof input === "object" ? input : {}) as { about?: unknown; goals?: unknown };
  const seen = new Set<string>();
  const goals: Goal[] = [];
  for (const raw of Array.isArray(src.goals) ? src.goals : []) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    const title = text(g.title, PROFILE_LIMITS.title);
    if (!title) continue;
    let id = text(g.id, 64);
    if (!id || seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    const date = text(g.targetDate ?? g.target_date, 10);
    goals.push({
      id,
      title,
      details: text(g.details, PROFILE_LIMITS.details),
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      done: g.done === true,
    });
    if (goals.length >= PROFILE_LIMITS.goals) break;
  }
  return { about: text(src.about, PROFILE_LIMITS.about), goals };
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
