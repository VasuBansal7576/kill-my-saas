import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { DashboardError, getOrganizerDashboard } from "./service";

type DashboardContext = { Bindings: Env } & ActorContext;

export const dashboardOrganizerRoutes = new Hono<DashboardContext>();

dashboardOrganizerRoutes.get("/events/:eventSlug/dashboard", async (context) => {
  if (!context.env.DATABASE_URL) {
    return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  }
  try {
    return context.json(await getOrganizerDashboard(
      createDatabase(context.env.DATABASE_URL),
      context.get("actor"),
      context.req.param("eventSlug"),
    ));
  } catch (error) {
    return dashboardError(context, error);
  }
});

function dashboardError(context: Context<DashboardContext>, error: unknown) {
  if (!(error instanceof DashboardError)) throw error;
  return context.json({ error: { code: error.code, message: error.message } }, error.code === "event_not_found" ? 404 : 403);
}
