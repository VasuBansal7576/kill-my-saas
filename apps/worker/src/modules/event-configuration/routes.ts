import { EventConfigurationInputSchema } from "@programflow/contracts";
import { createDatabase } from "@programflow/database";
import { Hono, type Context } from "hono";
import type { Env } from "../../env";
import type { ActorContext } from "../identity-access/actor";
import { EventConfigurationError, getEventConfiguration, updateEventConfiguration } from "./service";

export const eventConfigurationRoutes = new Hono<{ Bindings: Env } & ActorContext>();

eventConfigurationRoutes.get("/:eventSlug/configuration", async (context) => {
  const databaseUrl = context.env.DATABASE_URL;
  if (!databaseUrl) return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  try {
    return context.json(await getEventConfiguration(createDatabase(databaseUrl), context.get("actor"), context.req.param("eventSlug")));
  } catch (error) {
    return eventError(context, error);
  }
});

eventConfigurationRoutes.put("/:eventSlug/configuration", async (context) => {
  const databaseUrl = context.env.DATABASE_URL;
  if (!databaseUrl) return context.json({ error: { code: "database_not_configured", message: "Database configuration is required." } }, 503);
  const parsed = EventConfigurationInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: { code: "invalid_event_configuration", message: "Event configuration is invalid.", fields: parsed.error.flatten().fieldErrors } }, 400);
  }
  try {
    return context.json(await updateEventConfiguration(createDatabase(databaseUrl), context.get("actor"), context.req.param("eventSlug"), parsed.data));
  } catch (error) {
    return eventError(context, error);
  }
});

function eventError(context: Context<{ Bindings: Env } & ActorContext>, error: unknown) {
  if (error instanceof EventConfigurationError) {
    return context.json({ error: { code: error.code, message: error.message } }, error.code === "event_not_found" ? 404 : 403);
  }
  throw error;
}
