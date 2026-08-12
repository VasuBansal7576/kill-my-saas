import { z } from "zod";

const MembershipSchema = z.object({
  scope: z.enum(["organization", "event"]),
  role: z.enum(["organizer", "speaker", "reviewer"]),
});

const PersonaSchema = z.object({
  persona: z.string(),
  canonical_person_key: z.string().nullable(),
  name: z.string(),
  canonical_email: z.string().email().nullable(),
  aliases: z.array(z.string().email()),
  memberships: z.array(MembershipSchema),
  login_required: z.boolean(),
});

export const EvaluationFixtureSchema = z.object({
  schema_version: z.number().int().positive(),
  event: z.object({
    name: z.string(),
    starts_on: z.iso.date(),
    ends_on: z.iso.date(),
    location: z.string(),
    timezone: z.string(),
    tracks: z.array(z.string()),
    formats: z.array(z.string()),
    rooms: z.array(z.string()),
  }),
  personas: z.array(PersonaSchema),
  required_evaluator_config_personas: z.array(z.string()).default([]),
});

export type EvaluationFixture = z.infer<typeof EvaluationFixtureSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export interface EvaluatorAuthLogin {
  persona: string;
  canonicalPersonKey: string;
  name: string;
  email: string;
  password: string;
}

export interface EvaluatorAuthRegistrar {
  signUp(login: EvaluatorAuthLogin): Promise<unknown>;
  verify(login: EvaluatorAuthLogin): Promise<boolean>;
}

export function applyPersonaEmailOverrides(
  input: unknown,
  overrides: Readonly<Record<string, string | undefined>>,
): EvaluationFixture {
  const fixture = EvaluationFixtureSchema.parse(input);
  const ownerByEmail = new Map<string, string>();

  const personas = fixture.personas.map((persona) => {
    const override = overrides[persona.persona]?.trim();
    const canonicalEmail = override || persona.canonical_email;
    const aliases = [persona.canonical_email, ...persona.aliases]
      .filter((email): email is string => Boolean(email))
      .filter((email) => normalizeEmail(email) !== normalizeEmail(canonicalEmail ?? email));

    for (const email of [canonicalEmail, ...aliases].filter((value): value is string => Boolean(value))) {
      const normalized = normalizeEmail(email);
      const existingOwner = ownerByEmail.get(normalized);
      if (existingOwner && existingOwner !== persona.persona) {
        throw new Error(`Evaluator email ${email} resolves to both ${existingOwner} and ${persona.persona}.`);
      }
      ownerByEmail.set(normalized, persona.persona);
    }

    return { ...persona, canonical_email: canonicalEmail, aliases };
  });

  return { ...fixture, personas };
}

export function buildEvaluatorAuthLogins(
  input: unknown,
  overrides: Readonly<Record<string, string | undefined>>,
  passwords: Readonly<Record<string, string | undefined>>,
): EvaluatorAuthLogin[] {
  const fixture = applyPersonaEmailOverrides(input, overrides);
  const requiredPersonas = new Set(fixture.required_evaluator_config_personas);
  const logins: EvaluatorAuthLogin[] = [];

  for (const personaName of requiredPersonas) {
    const persona = fixture.personas.find((candidate) => candidate.persona === personaName);
    if (!persona?.login_required || !persona.canonical_person_key || !persona.canonical_email) {
      throw new Error(`Required evaluator persona ${personaName} has no complete login identity.`);
    }
    const password = passwords[personaName];
    if (!password) throw new Error(`A password is required for evaluator persona ${personaName}.`);

    const seen = new Set<string>();
    for (const email of [persona.canonical_email, ...persona.aliases]) {
      const normalized = normalizeEmail(email);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      logins.push({
        persona: persona.persona,
        canonicalPersonKey: persona.canonical_person_key,
        name: persona.name,
        email,
        password,
      });
    }
  }

  return logins;
}

export async function ensureEvaluatorAuthLogins(
  logins: readonly EvaluatorAuthLogin[],
  registrar: EvaluatorAuthRegistrar,
): Promise<{ created: number; existing: number; verified: number }> {
  let created = 0;
  let existing = 0;
  let verified = 0;

  for (const login of logins) {
    if (await registrar.verify(login)) {
      existing += 1;
      verified += 1;
      continue;
    }

    await registrar.signUp(login);
    if (!await registrar.verify(login)) {
      throw new Error(`Evaluator login verification failed for ${login.persona} at ${login.email}.`);
    }
    created += 1;
    verified += 1;
  }

  return { created, existing, verified };
}
