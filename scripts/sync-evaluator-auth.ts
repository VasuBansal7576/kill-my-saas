import { readFile } from "node:fs/promises";
import { createAuthClient, isAuthApiError } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import {
  buildEvaluatorAuthLogins,
  ensureEvaluatorAuthLogins,
  normalizeEmail,
  type EvaluatorAuthLogin,
} from "../packages/testkit/src/evaluation-fixture";

const appEnvironment = process.env.APP_ENV;
const confirmation = process.env.EVALUATION_SEED_CONFIRM;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const authOrigin = process.env.EVALUATOR_AUTH_ORIGIN;

if (!appEnvironment || !["local", "preview", "evaluation"].includes(appEnvironment)) {
  throw new Error("Evaluator auth synchronization is allowed only in local, preview, or evaluation environments.");
}
if (confirmation !== "DevFlow Conf 2027") {
  throw new Error("Set EVALUATION_SEED_CONFIRM=\"DevFlow Conf 2027\" to synchronize evaluator auth intentionally.");
}
if (!authBaseUrl) throw new Error("NEON_AUTH_BASE_URL is required.");
if (!authOrigin) throw new Error("EVALUATOR_AUTH_ORIGIN is required.");

const fixtureJson = JSON.parse(await readFile("docs/fixtures/evaluator-personas.json", "utf8")) as unknown;
const overrides = parseStringRecord("EVALUATOR_PERSONA_EMAILS_JSON", process.env.EVALUATOR_PERSONA_EMAILS_JSON ?? "{}");
const passwords = parseStringRecord("EVALUATOR_PERSONA_PASSWORDS_JSON", process.env.EVALUATOR_PERSONA_PASSWORDS_JSON);
const logins = buildEvaluatorAuthLogins(fixtureJson, overrides, passwords);
const authClient = createAuthClient(authBaseUrl, {
  adapter: BetterAuthVanillaAdapter({
    fetchOptions: { headers: { Origin: new URL(authOrigin).origin } },
  }),
});

const result = await ensureEvaluatorAuthLogins(logins, {
  async verify(login) {
    try {
      const response = await authClient.signIn.email({ email: login.email, password: login.password });
      if (response.error) {
        if (isInvalidCredentials(response.error)) return false;
        throw authOperationError("verify", login, response.error);
      }
      return normalizeEmail(response.data.user.email) === normalizeEmail(login.email);
    } catch (caught) {
      if (isAuthApiError(caught) && isInvalidCredentials(caught)) return false;
      throw caught;
    }
  },
  async signUp(login) {
    try {
      const response = await authClient.signUp.email({
        email: login.email,
        password: login.password,
        name: login.name,
      });
      if (response.error) throw authOperationError("create", login, response.error);
    } catch (caught) {
      if (isAuthApiError(caught)) throw authOperationError("create", login, caught);
      throw caught;
    }
  },
});

function isInvalidCredentials(error: { status?: number; code?: string }): boolean {
  return error.status === 401
    || ["INVALID_EMAIL_OR_PASSWORD", "invalid_credentials"].includes(error.code ?? "");
}

console.info(JSON.stringify({
  personas: new Set(logins.map((login) => login.persona)).size,
  loginVariants: logins.length,
  ...result,
}));

function parseStringRecord(name: string, raw: string | undefined): Record<string, string> {
  if (!raw) throw new Error(`${name} is required.`);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${name}.${key} must be a non-empty string.`);
    }
    record[key] = value;
  }
  return record;
}

function authOperationError(
  operation: "create" | "verify",
  login: EvaluatorAuthLogin,
  error: { code?: string; message?: string },
): Error {
  const reason = error.code ?? error.message ?? "unknown_auth_error";
  return new Error(`Could not ${operation} evaluator login ${login.persona} at ${login.email}: ${reason}.`);
}
