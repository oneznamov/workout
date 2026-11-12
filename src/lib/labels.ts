import type { Equipment, MuscleGroup, SetType, Tracking, WorkoutStatus } from "@/db/schema";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: "Груди",
  back: "Спина",
  shoulders: "Плечі",
  biceps: "Біцепс",
  triceps: "Трицепс",
  forearms: "Передпліччя",
  quads: "Квадрицепс",
  hamstrings: "Біцепс стегна",
  glutes: "Сідниці",
  calves: "Литки",
  core: "Прес",
  cardio: "Кардіо",
  full_body: "Все тіло",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Штанга",
  dumbbell: "Гантелі",
  machine: "Тренажер",
  cable: "Блок",
  bodyweight: "Власна вага",
  kettlebell: "Гиря",
  band: "Гума",
  smith: "Сміт",
  other: "Інше",
};

export const TRACKING_LABEL: Record<Tracking, string> = {
  weight_reps: "Вага × повторення",
  reps: "Повторення (власна вага)",
  duration: "Час",
  distance: "Дистанція + час",
};

export const STATUS_LABEL: Record<WorkoutStatus, string> = {
  template: "Шаблон",
  planned: "Заплановано",
  in_progress: "Триває",
  completed: "Завершено",
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: "Робочий",
  warmup: "Розминка",
  drop: "Дроп-сет",
  failure: "До відмови",
};
export const SET_TYPE_SHORT: Record<SetType, string> = { normal: "", warmup: "Р", drop: "Д", failure: "В" };

export const METRIC_INFO: Record<string, { label: string; unit: string; agg: "sum" | "avg" | "last"; digits?: number }> = {
  body_mass: { label: "Вага тіла", unit: "кг", agg: "last", digits: 1 },
  body_fat_percentage: { label: "Жир", unit: "%", agg: "last", digits: 1 },
  lean_body_mass: { label: "Суха маса", unit: "кг", agg: "last", digits: 1 },
  resting_heart_rate: { label: "Пульс спокою", unit: "уд/хв", agg: "avg", digits: 0 },
  heart_rate_variability: { label: "HRV", unit: "мс", agg: "avg", digits: 0 },
  walking_heart_rate_average: { label: "Пульс під час ходьби", unit: "уд/хв", agg: "avg", digits: 0 },
  vo2_max: { label: "VO₂ max", unit: "мл/кг/хв", agg: "last", digits: 1 },
  step_count: { label: "Кроки", unit: "", agg: "sum", digits: 0 },
  active_energy: { label: "Активні калорії", unit: "ккал", agg: "sum", digits: 0 },
  basal_energy_burned: { label: "Базові калорії", unit: "ккал", agg: "sum", digits: 0 },
  apple_exercise_time: { label: "Хвилини вправ", unit: "хв", agg: "sum", digits: 0 },
  apple_stand_time: { label: "Час стоячи", unit: "хв", agg: "sum", digits: 0 },
  walking_running_distance: { label: "Ходьба + біг", unit: "км", agg: "sum", digits: 1 },
  flights_climbed: { label: "Поверхи", unit: "", agg: "sum", digits: 0 },
  sleep_analysis: { label: "Сон", unit: "год", agg: "last", digits: 1 },
  respiratory_rate: { label: "Частота дихання", unit: "/хв", agg: "avg", digits: 1 },
  blood_oxygen_saturation: { label: "SpO₂", unit: "%", agg: "avg", digits: 0 },
};
