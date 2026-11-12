/** Tape measurements of the body, in centimetres. Stored as daily metrics under these keys. */
export const MEASURES = [
  { key: "m_chest", label: "Груди", simple: true },
  { key: "m_waist", label: "Талія", simple: true },
  { key: "m_hips", label: "Сідниці", simple: true },
  { key: "m_neck", label: "Шия", simple: false },
  { key: "m_shoulders", label: "Плечі", simple: false },
  { key: "m_biceps", label: "Біцепс", simple: false },
  { key: "m_forearm", label: "Передпліччя", simple: false },
  { key: "m_thigh", label: "Стегно", simple: false },
  { key: "m_calf", label: "Литка", simple: false },
] as const;

export type MeasureKey = (typeof MEASURES)[number]["key"];
export const MEASURE_KEYS = MEASURES.map((m) => m.key) as MeasureKey[];
export const MEASURE_LABEL = Object.fromEntries(MEASURES.map((m) => [m.key, m.label])) as Record<MeasureKey, string>;
export const isMeasure = (key: string): key is MeasureKey => (MEASURE_KEYS as string[]).includes(key);
