import { appConfig } from "../../app.config";

export { appConfig };
export type Section = keyof typeof appConfig.sections;
export type Feature = keyof typeof appConfig.features;

export const sectionOn = (s: Section): boolean => appConfig.sections[s];
export const featureOn = (f: Feature): boolean => appConfig.features[f];

/** Which section owns an address; null — a part of the app that is always on. */
const SECTION_PATHS: [string, Section][] = [
  ["/calendar", "calendar"],
  ["/exercises", "exercises"],
  ["/analytics", "analytics"],
  ["/cardio", "cardio"],
  ["/programs", "programs"],
  ["/team", "team"],
];
export function sectionOf(pathname: string): Section | null {
  return SECTION_PATHS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

/** For API routes of a switched-off integration. */
export const disabled = () => Response.json({ error: "disabled", message: "This integration is switched off in app.config.ts." }, { status: 404 });
