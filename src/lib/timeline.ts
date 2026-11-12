import { describeSet, type CWorkout } from "./shape";

/**
 * Reconstructs what happened when during a workout: when each set was done and how long
 * the rest before it was. Uses the times the sets were ticked off when the workout was
 * tracked live; otherwise estimates them from the heart-rate curve (effort shows up as
 * peaks, recovery as dips).
 */

export type TimelineSet = {
  setId: string;
  weId: string;
  exercise: string;
  /** 1-based number of the set inside its exercise */
  index: number;
  label: string;
  start: string;
  end: string;
  restBeforeSec: number | null;
  peakHr: number | null;
};

export type Timeline = {
  mode: "logged" | "estimated";
  confidence: "high" | "medium" | "low";
  sets: TimelineSet[];
  workSec: number;
  restSec: number;
  avgRestSec: number | null;
  byExercise: { weId: string; exercise: string; sets: number; avgRestSec: number | null }[];
  zones: { zone: number; label: string; sec: number }[] | null;
  hrRef: number | null;
};

type Pt = { t: number; bpm: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Heart-rate peaks: local maxima that stand out from the dips around them. */
function findPeaks(pts: Pt[]): Pt[] {
  if (pts.length < 5) return [];
  const dt = median(pts.slice(1).map((p, i) => (p.t - pts[i].t) / 1000)) || 60;
  const k = dt >= 30 ? 0 : Math.max(1, Math.round(8 / dt));
  const smooth = pts.map((p, i) => {
    const win = pts.slice(Math.max(0, i - k), i + k + 1);
    return { t: p.t, bpm: win.reduce((a, x) => a + x.bpm, 0) / win.length };
  });
  const r = Math.max(1, Math.round(25 / dt));
  const w = Math.max(1, Math.round(90 / dt));
  const minProminence = dt >= 30 ? 3 : 5;
  const peaks: Pt[] = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    const v = smooth[i].bpm;
    let isMax = true;
    for (let j = Math.max(0, i - r); j <= Math.min(smooth.length - 1, i + r); j++) {
      if (smooth[j].bpm > v || (smooth[j].bpm === v && j < i)) isMax = false;
    }
    if (!isMax) continue;
    const left = Math.min(...smooth.slice(Math.max(0, i - w), i).map((p) => p.bpm));
    const right = Math.min(...smooth.slice(i + 1, i + w + 1).map((p) => p.bpm));
    if (v - Math.max(left, right) >= minProminence) peaks.push(smooth[i]);
  }
  return peaks;
}

export function buildTimeline(w: CWorkout): Timeline | null {
  if (!w.startedAt || !w.endedAt) return null;
  const t0 = +new Date(w.startedAt);
  const t1 = +new Date(w.endedAt);
  if (!(t1 > t0)) return null;

  const items = w.exercises.flatMap((e) =>
    e.sets
      .filter((s) => s.completed)
      .map((s, i) => {
        const timed = e.exercise.tracking === "duration" || e.exercise.tracking === "distance";
        const work = timed ? clamp(s.durationSec ?? 60, 10, 3600) : clamp((s.reps ?? 8) * 3 + 5, 15, 90);
        return {
          setId: s.id,
          weId: e.id,
          exercise: e.exercise.name,
          index: i + 1,
          label: describeSet(e.exercise.tracking, s),
          work,
          at: s.completedAt ? +new Date(s.completedAt) : null,
        };
      }),
  );
  if (items.length === 0) return null;

  const pts: Pt[] = w.health
    .flatMap((h) => h.hrSamples ?? [])
    .map((s) => ({ t: +new Date(s.t), bpm: s.bpm }))
    .filter((p) => p.t >= t0 - 60000 && p.t <= t1 + 60000)
    .sort((a, b) => a.t - b.t);

  // Was the workout tracked live? Then the ticks are spread across the session.
  const stamped = items.filter((it) => it.at != null && it.at >= t0 - 60000 && it.at <= t1 + 60000);
  const spread = stamped.length ? Math.max(...stamped.map((s) => s.at!)) - Math.min(...stamped.map((s) => s.at!)) : 0;
  const logged = stamped.length >= Math.max(2, Math.ceil(items.length * 0.6)) && spread > 120000;

  let ends: number[];
  let ordered = items;
  let confidence: Timeline["confidence"];

  if (logged) {
    ordered = [...stamped].sort((a, b) => a.at! - b.at!);
    ends = ordered.map((it) => it.at!);
    confidence = "high";
  } else {
    if (pts.length < 8) return null;
    // Start from an even spread, then snap each set to the nearest heart-rate peak.
    const total = (t1 - t0) / 1000;
    const workTotal = items.reduce((a, it) => a + it.work, 0);
    const scale = workTotal > total * 0.9 ? (total * 0.9) / workTotal : 1;
    const gap = Math.max(5, (total - workTotal * scale) / (items.length + 1));
    let cursor = t0 / 1000 + gap;
    const initial = items.map((it) => {
      cursor += it.work * scale;
      const end = cursor;
      cursor += gap;
      return end * 1000;
    });
    const peaks = findPeaks(pts);
    const dt = median(pts.slice(1).map((p, i) => (p.t - pts[i].t) / 1000)) || 60;
    const lag = dt >= 30 ? 0 : 10000; // the pulse tops out a little after the set ends
    const used = new Set<number>();
    let snapped = 0;
    let prevEnd = t0;
    ends = initial.map((guess, i) => {
      const reach = Math.max(45000, (gap * 1000) / 1.5);
      let best = -1;
      for (let p = 0; p < peaks.length; p++) {
        if (used.has(p)) continue;
        const cand = peaks[p].t - lag;
        if (cand < prevEnd + items[i].work * 500) continue;
        if (Math.abs(cand - guess) > reach) continue;
        if (best < 0 || Math.abs(cand - guess) < Math.abs(peaks[best].t - lag - guess)) best = p;
      }
      let end = guess;
      if (best >= 0) {
        used.add(best);
        end = peaks[best].t - lag;
        snapped++;
      }
      end = clamp(end, prevEnd + items[i].work * 1000 * scale + 3000, t1);
      prevEnd = end;
      return end;
    });
    confidence = snapped >= items.length * 0.6 && dt <= 15 ? "medium" : "low";
  }

  const sets: TimelineSet[] = [];
  let prevEnd: number | null = null;
  for (const [i, it] of ordered.entries()) {
    const end = ends[i];
    const start = Math.max(prevEnd ?? t0, end - it.work * 1000);
    const near = pts.filter((p) => p.t >= start - 10000 && p.t <= end + 30000);
    sets.push({
      setId: it.setId,
      weId: it.weId,
      exercise: it.exercise,
      index: it.index,
      label: it.label,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      restBeforeSec: prevEnd == null ? null : Math.max(0, Math.round((start - prevEnd) / 1000)),
      peakHr: near.length ? Math.max(...near.map((p) => p.bpm)) : null,
    });
    prevEnd = end;
  }

  const rests = sets.map((s) => s.restBeforeSec).filter((r): r is number => r != null);
  const byExercise = [...new Set(sets.map((s) => s.weId))].map((weId) => {
    const own = sets.filter((s) => s.weId === weId);
    // Rest inside the exercise: skip the first set (that gap is the change-over).
    const inner = own.slice(1).map((s) => s.restBeforeSec).filter((r): r is number => r != null);
    return {
      weId,
      exercise: own[0].exercise,
      sets: own.length,
      avgRestSec: inner.length ? Math.round(inner.reduce((a, b) => a + b, 0) / inner.length) : null,
    };
  });

  let zones: Timeline["zones"] = null;
  let hrRef: number | null = null;
  if (pts.length > 1) {
    hrRef = Math.max(185, ...pts.map((p) => p.bpm));
    const acc = [0, 0, 0, 0, 0];
    for (let i = 1; i < pts.length; i++) {
      const sec = Math.min(60, (pts[i].t - pts[i - 1].t) / 1000);
      const r = pts[i].bpm / hrRef;
      acc[r < 0.6 ? 0 : r < 0.7 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 3 : 4] += sec;
    }
    const labels = ["до 60%", "60–70%", "70–80%", "80–90%", "90%+"];
    zones = acc.map((sec, i) => ({ zone: i + 1, label: labels[i], sec: Math.round(sec) }));
  }

  return {
    mode: logged ? "logged" : "estimated",
    confidence,
    sets,
    workSec: Math.round(sets.reduce((a, s) => a + (+new Date(s.end) - +new Date(s.start)) / 1000, 0)),
    restSec: rests.reduce((a, b) => a + b, 0),
    avgRestSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null,
    byExercise,
    zones,
    hrRef,
  };
}
