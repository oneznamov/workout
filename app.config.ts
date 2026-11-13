/**
 * One place to shape the app for yourself: switch whole sections and integrations on or off,
 * rename it, set the time zone and the default weekly targets. Change a value, rebuild — done.
 *
 * A switched-off section disappears from the navigation and its pages redirect home; a switched-off
 * integration also closes its API endpoint. Nothing is deleted from the database.
 */
export const appConfig = {
  /** Shown in the navigation, the browser tab and on the phone's home screen. */
  name: "Workout",

  /** IANA time zone the training days are counted in (NEXT_PUBLIC_APP_TZ overrides it). */
  timeZone: "Europe/Kyiv",

  /** Sections of the interface. "Home", "Workouts", "Profile" and "Settings" are always there. */
  sections: {
    /** Month calendar of done and planned sessions. */
    calendar: true,
    /** Exercise library with per-exercise progress. */
    exercises: true,
    /** Charts: volume, frequency, records, muscle balance, heart rate. */
    analytics: true,
    /** Runs, rides and walks — from Apple Watch or added by hand. */
    cardio: true,
    /** Multi-week training programmes. */
    programs: true,
    /** Teams: leaderboard, weekly challenge, reactions. */
    team: true,
  },

  /** Integrations and extras. */
  features: {
    /** Built-in AI coach (each user connects their own API key in Settings). */
    ai: true,
    /** MCP server at /api/mcp — lets Claude plan and analyse workouts. */
    mcp: true,
    /** Apple Health import at /api/health (metrics and Apple Watch workouts). */
    appleHealth: true,
    /** Push notification when the rest timer ends. */
    push: true,
  },

  /** Weekly targets a new account starts with (each user can change theirs). */
  weeklyGoals: { workouts: 3, cardioMin: 150, muscles: 11 },
} as const;

export type AppConfig = typeof appConfig;
