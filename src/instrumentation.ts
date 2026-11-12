import type { Instrumentation } from "next";

/** Every server-side failure (pages, actions, API routes) lands in the admin's error list. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("@/lib/errors");
  const error = err instanceof Error ? err : new Error(String(err));
  const cause = error.cause instanceof Error ? `\ncause: ${error.cause.message}` : "";
  await logError({
    source: "server",
    message: error.message,
    detail: `${context.routeType} ${context.routePath}\n${error.stack ?? ""}${cause}`,
    path: `${request.method} ${request.path}`,
  });
};
