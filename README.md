# Workout

Особистий щоденник тренувань: планування, запис підходів у залі з таймером, аналітика, дані Apple Watch і керування через Claude (MCP).

- **Стек:** Next.js 16 (App Router, Cache Components) · pnpm · Tailwind 4 · Drizzle ORM · Postgres (Neon через Vercel Marketplace)
- **Прод:** Vercel-проєкт `workout`, гілка `main`

## Можливості

- Вхід за логіном і паролем, сесія зберігається на рік (httpOnly cookie).
- Бібліотека з 134 стандартних вправ (вага × повторення, власна вага, час, дистанція) + свої вправи.
- Тренування: шаблони, план на дату, живий режим із секундоміром, таймером відпочинку, підказкою «минулого разу».
- Аналітика: тоннаж, частота, час, підходи за групами мʼязів, розрахунковий 1ПМ і прогрес по кожній вправі.
- Здоровʼя: вага тіла (вручну або з Apple Health), пульс спокою, HRV, VO₂ max, кроки, сон тощо.
- Apple Watch: тренування з годинника автоматично привʼязуються до запису в щоденнику за часом (пульс, калорії).
- Claude: MCP-сервер `/api/mcp` — планувати, змінювати (навіть під час тренування) та аналізувати тренування.

## Розробка

```bash
pnpm install
vercel env pull .env.local   # DATABASE_URL, AUTH_SECRET
pnpm dev
```

| Команда | Що робить |
| --- | --- |
| `pnpm db:generate` | згенерувати міграцію після зміни `src/db/schema.ts` |
| `pnpm db:setup` | застосувати міграції та оновити бібліотеку вправ |
| `pnpm user:create <login>` | створити користувача або змінити йому пароль |

База одна — продакшн (проєкт для одного користувача).

## Інтеграції

Токени створюються в застосунку: **Налаштування → Токени доступу**.

### Claude (MCP)

- claude.ai: Settings → Connectors → Add custom connector → `https://<домен>/api/mcp?key=<токен>`
- Claude Code: `claude mcp add --transport http workout https://<домен>/api/mcp --header "Authorization: Bearer <токен>"`

### Apple Health

`POST https://<домен>/api/health` із заголовком `Authorization: Bearer <токен>`. Приймає формат застосунку
[Health Auto Export](https://www.healthexportapp.com/) (REST API automation, JSON) — метрики й тренування з пульсом —
або простий JSON `{ "metrics": [{ "name", "date", "qty", "units" }], "workouts": [{ "name", "start", "end", ... }] }`
(наприклад, з iOS Shortcuts).
