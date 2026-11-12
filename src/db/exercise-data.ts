import type { Equipment, MuscleGroup, Tracking } from "./schema";

type Row = [
  name: string,
  nameUk: string,
  muscle: MuscleGroup,
  secondary: MuscleGroup[],
  equipment: Equipment,
  tracking?: Tracking,
];

/** Вбудована бібліотека стандартних вправ для залу. */
const rows: Row[] = [
  // ── Груди ──
  ["Barbell Bench Press", "Жим штанги лежачи", "chest", ["triceps", "shoulders"], "barbell"],
  ["Incline Barbell Bench Press", "Жим штанги на похилій лаві", "chest", ["shoulders", "triceps"], "barbell"],
  ["Decline Barbell Bench Press", "Жим штанги головою вниз", "chest", ["triceps"], "barbell"],
  ["Dumbbell Bench Press", "Жим гантелей лежачи", "chest", ["triceps", "shoulders"], "dumbbell"],
  ["Incline Dumbbell Press", "Жим гантелей на похилій лаві", "chest", ["shoulders", "triceps"], "dumbbell"],
  ["Dumbbell Fly", "Розведення гантелей лежачи", "chest", [], "dumbbell"],
  ["Incline Dumbbell Fly", "Розведення гантелей на похилій лаві", "chest", [], "dumbbell"],
  ["Smith Machine Bench Press", "Жим у Сміті лежачи", "chest", ["triceps"], "smith"],
  ["Machine Chest Press", "Жим від грудей у тренажері", "chest", ["triceps"], "machine"],
  ["Pec Deck Fly", "Зведення рук у тренажері (батерфляй)", "chest", [], "machine"],
  ["Cable Crossover", "Кросовер", "chest", [], "cable"],
  ["Low Cable Fly", "Зведення рук з нижніх блоків", "chest", [], "cable"],
  ["Push-Up", "Віджимання від підлоги", "chest", ["triceps", "shoulders", "core"], "bodyweight", "reps"],
  ["Chest Dip", "Віджимання на брусах (груди)", "chest", ["triceps", "shoulders"], "bodyweight", "reps"],

  // ── Спина ──
  ["Deadlift", "Станова тяга", "back", ["hamstrings", "glutes", "forearms"], "barbell"],
  ["Pull-Up", "Підтягування", "back", ["biceps", "forearms"], "bodyweight", "reps"],
  ["Chin-Up", "Підтягування зворотним хватом", "back", ["biceps"], "bodyweight", "reps"],
  ["Lat Pulldown", "Тяга верхнього блока", "back", ["biceps"], "cable"],
  ["Close-Grip Lat Pulldown", "Тяга верхнього блока вузьким хватом", "back", ["biceps"], "cable"],
  ["Barbell Row", "Тяга штанги в нахилі", "back", ["biceps", "forearms"], "barbell"],
  ["Pendlay Row", "Тяга Пендлея", "back", ["biceps"], "barbell"],
  ["T-Bar Row", "Тяга Т-грифа", "back", ["biceps"], "barbell"],
  ["Dumbbell Row", "Тяга гантелі в нахилі", "back", ["biceps"], "dumbbell"],
  ["Seated Cable Row", "Тяга нижнього блока сидячи", "back", ["biceps"], "cable"],
  ["Machine Row", "Тяга у важільному тренажері", "back", ["biceps"], "machine"],
  ["Chest-Supported Row", "Тяга з упором грудьми", "back", ["biceps"], "machine"],
  ["Straight-Arm Pulldown", "Пуловер на блоці прямими руками", "back", [], "cable"],
  ["Dumbbell Pullover", "Пуловер з гантеллю", "back", ["chest"], "dumbbell"],
  ["Rack Pull", "Тяга з плінтів", "back", ["glutes", "forearms"], "barbell"],
  ["Back Extension", "Гіперекстензія", "back", ["glutes", "hamstrings"], "bodyweight", "reps"],
  ["Barbell Shrug", "Шраги зі штангою", "back", ["forearms"], "barbell"],
  ["Dumbbell Shrug", "Шраги з гантелями", "back", ["forearms"], "dumbbell"],

  // ── Плечі ──
  ["Overhead Press", "Жим штанги стоячи", "shoulders", ["triceps", "core"], "barbell"],
  ["Seated Dumbbell Shoulder Press", "Жим гантелей сидячи", "shoulders", ["triceps"], "dumbbell"],
  ["Arnold Press", "Жим Арнольда", "shoulders", ["triceps"], "dumbbell"],
  ["Machine Shoulder Press", "Жим на плечі в тренажері", "shoulders", ["triceps"], "machine"],
  ["Dumbbell Lateral Raise", "Махи гантелями в сторони", "shoulders", [], "dumbbell"],
  ["Cable Lateral Raise", "Махи в сторони на блоці", "shoulders", [], "cable"],
  ["Machine Lateral Raise", "Махи в сторони в тренажері", "shoulders", [], "machine"],
  ["Dumbbell Front Raise", "Підйом гантелей перед собою", "shoulders", [], "dumbbell"],
  ["Reverse Pec Deck", "Зворотні розведення в тренажері", "shoulders", ["back"], "machine"],
  ["Bent-Over Dumbbell Reverse Fly", "Розведення гантелей у нахилі", "shoulders", ["back"], "dumbbell"],
  ["Face Pull", "Тяга каната до обличчя", "shoulders", ["back"], "cable"],
  ["Upright Row", "Тяга штанги до підборіддя", "shoulders", ["back"], "barbell"],

  // ── Біцепс ──
  ["Barbell Curl", "Підйом штанги на біцепс", "biceps", ["forearms"], "barbell"],
  ["EZ-Bar Curl", "Підйом EZ-грифа на біцепс", "biceps", ["forearms"], "barbell"],
  ["Dumbbell Curl", "Підйом гантелей на біцепс", "biceps", ["forearms"], "dumbbell"],
  ["Hammer Curl", "Молотки", "biceps", ["forearms"], "dumbbell"],
  ["Incline Dumbbell Curl", "Підйом гантелей на похилій лаві", "biceps", [], "dumbbell"],
  ["Preacher Curl", "Згинання на лаві Скотта", "biceps", [], "barbell"],
  ["Machine Preacher Curl", "Згинання на біцепс у тренажері", "biceps", [], "machine"],
  ["Concentration Curl", "Концентрований підйом", "biceps", [], "dumbbell"],
  ["Cable Curl", "Згинання рук на нижньому блоці", "biceps", [], "cable"],
  ["Bayesian Cable Curl", "Баєсівське згинання на блоці", "biceps", [], "cable"],

  // ── Трицепс ──
  ["Close-Grip Bench Press", "Жим вузьким хватом", "triceps", ["chest", "shoulders"], "barbell"],
  ["Triceps Pushdown", "Розгинання рук на блоці", "triceps", [], "cable"],
  ["Rope Pushdown", "Розгинання рук з канатом", "triceps", [], "cable"],
  ["Overhead Cable Triceps Extension", "Розгинання з-за голови на блоці", "triceps", [], "cable"],
  ["Skull Crusher", "Французький жим лежачи", "triceps", [], "barbell"],
  ["Overhead Dumbbell Triceps Extension", "Розгинання гантелі з-за голови", "triceps", [], "dumbbell"],
  ["Dumbbell Kickback", "Розгинання руки в нахилі", "triceps", [], "dumbbell"],
  ["Triceps Dip", "Віджимання на брусах (трицепс)", "triceps", ["chest", "shoulders"], "bodyweight", "reps"],
  ["Bench Dip", "Зворотні віджимання від лави", "triceps", [], "bodyweight", "reps"],
  ["Machine Triceps Extension", "Розгинання на трицепс у тренажері", "triceps", [], "machine"],

  // ── Передпліччя ──
  ["Wrist Curl", "Згинання зап'ясть", "forearms", [], "barbell"],
  ["Reverse Wrist Curl", "Розгинання зап'ясть", "forearms", [], "barbell"],
  ["Reverse Barbell Curl", "Підйом штанги зворотним хватом", "forearms", ["biceps"], "barbell"],
  ["Farmer's Walk", "Прогулянка фермера", "forearms", ["core", "back"], "dumbbell", "duration"],
  ["Dead Hang", "Вис на турніку", "forearms", ["back"], "bodyweight", "duration"],

  // ── Квадрицепс ──
  ["Back Squat", "Присідання зі штангою", "quads", ["glutes", "hamstrings", "core"], "barbell"],
  ["Front Squat", "Фронтальні присідання", "quads", ["glutes", "core"], "barbell"],
  ["Smith Machine Squat", "Присідання у Сміті", "quads", ["glutes"], "smith"],
  ["Hack Squat", "Гак-присідання", "quads", ["glutes"], "machine"],
  ["Leg Press", "Жим ногами", "quads", ["glutes", "hamstrings"], "machine"],
  ["Leg Extension", "Розгинання ніг у тренажері", "quads", [], "machine"],
  ["Goblet Squat", "Гоблет-присідання", "quads", ["glutes", "core"], "dumbbell"],
  ["Bulgarian Split Squat", "Болгарські випади", "quads", ["glutes"], "dumbbell"],
  ["Walking Lunge", "Випади в ходьбі", "quads", ["glutes", "hamstrings"], "dumbbell"],
  ["Reverse Lunge", "Зворотні випади", "quads", ["glutes"], "dumbbell"],
  ["Step-Up", "Зашагування на платформу", "quads", ["glutes"], "dumbbell"],
  ["Bodyweight Squat", "Присідання з власною вагою", "quads", ["glutes"], "bodyweight", "reps"],
  ["Pistol Squat", "Пістолетик", "quads", ["glutes", "core"], "bodyweight", "reps"],

  // ── Задня поверхня стегна ──
  ["Romanian Deadlift", "Румунська тяга", "hamstrings", ["glutes", "back"], "barbell"],
  ["Dumbbell Romanian Deadlift", "Румунська тяга з гантелями", "hamstrings", ["glutes", "back"], "dumbbell"],
  ["Stiff-Leg Deadlift", "Тяга на прямих ногах", "hamstrings", ["glutes", "back"], "barbell"],
  ["Lying Leg Curl", "Згинання ніг лежачи", "hamstrings", [], "machine"],
  ["Seated Leg Curl", "Згинання ніг сидячи", "hamstrings", [], "machine"],
  ["Good Morning", "Гуд-морнінг", "hamstrings", ["glutes", "back"], "barbell"],
  ["Nordic Hamstring Curl", "Нордичні згинання", "hamstrings", [], "bodyweight", "reps"],

  // ── Сідниці ──
  ["Hip Thrust", "Сідничний міст зі штангою", "glutes", ["hamstrings"], "barbell"],
  ["Machine Hip Thrust", "Сідничний міст у тренажері", "glutes", ["hamstrings"], "machine"],
  ["Glute Bridge", "Сідничний місток", "glutes", ["hamstrings"], "bodyweight", "reps"],
  ["Cable Kickback", "Відведення ноги назад на блоці", "glutes", [], "cable"],
  ["Hip Abduction Machine", "Розведення ніг у тренажері", "glutes", [], "machine"],
  ["Hip Adduction Machine", "Зведення ніг у тренажері", "glutes", [], "machine"],
  ["Sumo Deadlift", "Станова тяга сумо", "glutes", ["hamstrings", "back", "quads"], "barbell"],
  ["Cable Pull-Through", "Протяжка на блоці", "glutes", ["hamstrings"], "cable"],

  // ── Литки ──
  ["Standing Calf Raise", "Підйом на носки стоячи", "calves", [], "machine"],
  ["Seated Calf Raise", "Підйом на носки сидячи", "calves", [], "machine"],
  ["Leg Press Calf Raise", "Підйом на носки в жимі ногами", "calves", [], "machine"],
  ["Dumbbell Calf Raise", "Підйом на носки з гантелями", "calves", [], "dumbbell"],

  // ── Прес / кор ──
  ["Plank", "Планка", "core", ["shoulders"], "bodyweight", "duration"],
  ["Side Plank", "Бічна планка", "core", [], "bodyweight", "duration"],
  ["Crunch", "Скручування", "core", [], "bodyweight", "reps"],
  ["Cable Crunch", "Скручування на блоці", "core", [], "cable"],
  ["Machine Crunch", "Скручування в тренажері", "core", [], "machine"],
  ["Hanging Leg Raise", "Підйом ніг у висі", "core", ["forearms"], "bodyweight", "reps"],
  ["Hanging Knee Raise", "Підйом колін у висі", "core", [], "bodyweight", "reps"],
  ["Lying Leg Raise", "Підйом ніг лежачи", "core", [], "bodyweight", "reps"],
  ["Russian Twist", "Російські скручування", "core", [], "bodyweight", "reps"],
  ["Ab Wheel Rollout", "Ролик для преса", "core", ["shoulders"], "other", "reps"],
  ["Bicycle Crunch", "Велосипед", "core", [], "bodyweight", "reps"],
  ["Mountain Climber", "Альпініст", "core", ["cardio"], "bodyweight", "reps"],
  ["Cable Woodchopper", "Дроворуб на блоці", "core", [], "cable"],
  ["Pallof Press", "Жим Паллофа", "core", [], "cable"],
  ["Dead Bug", "Мертвий жук", "core", [], "bodyweight", "reps"],

  // ── Все тіло / функціональні ──
  ["Kettlebell Swing", "Махи гирею", "full_body", ["glutes", "hamstrings", "core"], "kettlebell"],
  ["Power Clean", "Взяття штанги на груди", "full_body", ["back", "quads", "shoulders"], "barbell"],
  ["Clean and Jerk", "Поштовх", "full_body", ["quads", "shoulders", "back"], "barbell"],
  ["Snatch", "Ривок", "full_body", ["shoulders", "back", "quads"], "barbell"],
  ["Thruster", "Трастер", "full_body", ["quads", "shoulders"], "barbell"],
  ["Burpee", "Берпі", "full_body", ["cardio"], "bodyweight", "reps"],
  ["Turkish Get-Up", "Турецький підйом", "full_body", ["core", "shoulders"], "kettlebell"],
  ["Box Jump", "Стрибки на тумбу", "full_body", ["quads", "glutes"], "bodyweight", "reps"],
  ["Battle Ropes", "Канати", "full_body", ["cardio", "shoulders"], "other", "duration"],
  ["Sled Push", "Штовхання саней", "full_body", ["quads", "glutes"], "other", "distance"],

  // ── Кардіо ──
  ["Treadmill Run", "Біг на доріжці", "cardio", ["quads", "calves"], "machine", "distance"],
  ["Treadmill Walk (Incline)", "Ходьба на доріжці під нахилом", "cardio", ["glutes", "calves"], "machine", "distance"],
  ["Stationary Bike", "Велотренажер", "cardio", ["quads"], "machine", "distance"],
  ["Rowing Machine", "Гребний тренажер", "cardio", ["back", "quads"], "machine", "distance"],
  ["Elliptical", "Еліпсоїд", "cardio", [], "machine", "distance"],
  ["Stair Climber", "Степер", "cardio", ["glutes", "quads"], "machine", "duration"],
  ["Jump Rope", "Скакалка", "cardio", ["calves"], "other", "duration"],
  ["Assault Bike", "Аеробайк", "cardio", ["full_body"], "machine", "duration"],
];

export const slugify = (s: string) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const DEFAULT_EXERCISES = rows.map(([name, nameUk, muscle, secondaryMuscles, equipment, tracking]) => ({
  slug: slugify(name),
  name,
  nameUk,
  muscle,
  secondaryMuscles,
  equipment,
  tracking: tracking ?? ("weight_reps" as Tracking),
}));
