import type { MuscleGroup } from "@/db/schema";
import type { Sex } from "@/lib/profile";

/**
 * Geometry of the muscle map: a body outline and one or more shapes per muscle group, for the
 * front and the back, drawn from a handful of proportions that differ between a male and a
 * female figure (shoulder, chest, waist and hip width, arm thickness).
 *
 * Coordinates live in a 200 × 420 box with the body's centre line at x = 100. Every shape is
 * described for the left half; `mirror: true` means "draw it again flipped to the right".
 */
export type Shape = { d: string; mirror: boolean };
export type BodyShapes = {
  outline: Shape[];
  head: { cx: number; cy: number; rx: number; ry: number };
  front: Partial<Record<MuscleGroup, Shape[]>>;
  back: Partial<Record<MuscleGroup, Shape[]>>;
};

const PROPORTIONS = {
  male: { S: 47, N: 9.5, CH: 31, W: 25, H: 28, arm: 14, head: 16.5 },
  female: { S: 39, N: 8, CH: 26.5, W: 19.5, H: 31, arm: 11.5, head: 15.5 },
};

const n = (v: number) => Math.round(v * 10) / 10;
/** Builds a path from "x,y" pairs given relative to the centre line (x grows to the left). */
function path(strings: TemplateStringsArray, ...values: number[]) {
  // Values alternate x (distance left of centre) and y inside each command.
  let out = "";
  let isX = true;
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      out += isX ? n(100 - values[i]) : n(values[i]);
      isX = !isX;
    }
  });
  return out;
}
const both = (d: string): Shape => ({ d, mirror: true });
const once = (d: string): Shape => ({ d, mirror: false });

export function bodyShapes(sex: Sex | null): BodyShapes {
  const { S, N, CH, W, H, arm, head } = PROPORTIONS[sex ?? "male"];
  const ax = S + 7; // outer edge of the upper arm
  const fx = S + 9; // outer edge of the forearm

  const outline: Shape[] = [
    // neck
    once(`M${n(100 - N)} 44L${n(100 + N)} 44L${n(100 + N + 3)} 62L${n(100 - N - 3)} 62Z`),
    // torso half: trapezius slope, side, waist, hip, down to the crotch
    both(
      path`M${-0.5} ${56}L${N + 2} ${57}Q${S - 16} ${60} ${S - 6} ${67}L${CH + 3} ${96}Q${W + 1} ${126} ${W} ${152}Q${H + 3} ${172} ${H} ${196}L${H - 1} ${216}L${-0.5} ${220}Z`,
    ),
    // upper arm with the shoulder
    both(path`M${S - 10} ${65}Q${S + 5} ${62} ${ax} ${82}Q${ax + 3} ${118} ${ax + 1} ${152}L${ax + 1 - arm} ${152}Q${CH + 2} ${122} ${CH + 1} ${96}Z`),
    // forearm
    both(path`M${ax + 1} ${150}Q${fx + 3} ${182} ${fx + 1} ${214}L${fx - 8} ${214}Q${ax - arm - 1} ${182} ${ax + 1 - arm} ${150}Z`),
    // hand
    both(path`M${fx + 1.5} ${213}Q${fx + 4} ${228} ${fx - 1} ${238}Q${fx - 6} ${240} ${fx - 8.5} ${232}L${fx - 8.5} ${213}Z`),
    // thigh
    both(path`M${H} ${192}Q${H + 3} ${250} ${H - 6} ${306}L${8} ${306}Q${4} ${262} ${0.5} ${216}Z`),
    // lower leg
    both(path`M${H - 6} ${302}Q${H + 1} ${336} ${H - 8} ${394}L${11} ${394}Q${5} ${340} ${8} ${302}Z`),
    // foot
    both(path`M${H - 8} ${392}Q${H - 4} ${404} ${H - 10} ${408}L${10} ${408}Q${7} ${400} ${11} ${392}Z`),
  ];

  const delt = both(path`M${S - 12} ${66}Q${S + 4} ${63} ${ax - 1} ${83}Q${ax} ${94} ${ax - 3} ${100}Q${S - 6} ${96} ${S - 12} ${85}Q${S - 16} ${74} ${S - 12} ${66}Z`);
  const upperArm = both(path`M${ax - 2.5} ${103}Q${ax - arm / 2} ${99} ${ax + 2 - arm} ${104}Q${ax + 1.5 - arm} ${128} ${ax + 2.5 - arm} ${148}L${ax - 0.5} ${148}Q${ax + 1.5} ${124} ${ax - 2.5} ${103}Z`);
  const forearm = both(path`M${ax} ${156}L${ax + 2.5 - arm} ${156}Q${ax - arm} ${184} ${fx - 6.5} ${210}L${fx} ${210}Q${fx + 2} ${182} ${ax} ${156}Z`);

  const front: BodyShapes["front"] = {
    shoulders: [delt],
    chest: [both(path`M${1.5} ${71}Q${14} ${67} ${S - 15} ${76}Q${CH + 1} ${88} ${CH - 2} ${101}Q${15} ${113} ${1.5} ${107}Z`)],
    biceps: [upperArm],
    forearms: [forearm],
    core: [
      // abs: one rounded block on the centre line, then the obliques at the sides
      once(
        `M${n(100 - 11)} 114Q100 110 ${n(100 + 11)} 114L${n(100 + 11)} 176Q${n(100 + 10)} 186 100 190Q${n(100 - 10)} 186 ${n(100 - 11)} 176Z`,
      ),
      both(path`M${14} ${116}Q${CH - 4} ${112} ${CH - 1} ${106}Q${W + 1} ${132} ${W - 1} ${154}Q${W + 2} ${170} ${14} ${180}Z`),
    ],
    quads: [both(path`M${H - 2} ${224}Q${H / 2 + 2} ${212} ${4} ${226}Q${7} ${262} ${10} ${294}Q${H / 2 + 1} ${304} ${H - 7} ${294}Q${H + 1} ${258} ${H - 2} ${224}Z`)],
    calves: [both(path`M${H - 7.5} ${312}Q${H / 2 + 1} ${306} ${10} ${312}Q${8.5} ${346} ${12.5} ${384}L${H - 10} ${384}Q${H - 2.5} ${346} ${H - 7.5} ${312}Z`)],
  };

  const back: BodyShapes["back"] = {
    back: [
      // trapezius: a kite from the neck across the shoulders down to mid-back
      once(
        `M100 55L${n(100 - N - 3)} 60L${n(100 - S + 14)} 72Q${n(100 - 14)} 92 100 124Q${n(100 + 14)} 92 ${n(100 + S - 14)} 72L${n(100 + N + 3)} 60Z`,
      ),
      // lats
      both(path`M${CH - 1} ${92}Q${14} ${104} ${2} ${134}L${2} ${178}Q${W - 3} ${172} ${W - 1} ${154}Q${W + 2} ${124} ${CH - 1} ${92}Z`),
    ],
    shoulders: [delt],
    triceps: [upperArm],
    forearms: [forearm],
    glutes: [both(path`M${1.5} ${186}Q${H / 2} ${178} ${H - 2} ${194}Q${H + 1} ${210} ${H - 3} ${222}Q${H / 2} ${230} ${1.5} ${222}Z`)],
    hamstrings: [both(path`M${H - 3} ${230}Q${H / 2} ${224} ${4} ${230}Q${7} ${262} ${10} ${294}Q${H / 2 + 1} ${302} ${H - 7} ${294}Q${H} ${260} ${H - 3} ${230}Z`)],
    calves: [both(path`M${H - 7} ${310}Q${H / 2 + 1} ${300} ${9.5} ${310}Q${5.5} ${340} ${12.5} ${376}L${H - 10} ${376}Q${H + 0.5} ${340} ${H - 7} ${310}Z`)],
  };

  return { outline, head: { cx: 100, cy: 27, rx: head, ry: head * 1.2 }, front, back };
}
