import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

type SessionResponse = {
  organizationMemberships: Array<{ id: string; name: string; slug: string; roles: string[] }>;
  eventMemberships: Array<{ id: string; organizationId: string; name: string; slug: string; roles: string[] }>;
  recommendedPath: string;
};

type SetupFields = {
  organizationName: string;
  organizationSlug: string;
  eventName: string;
  eventSlug: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
  location: string;
  primaryColor: string;
};

export function WorkspaceOnboardingPage({ additionalEvent = false }: { additionalEvent?: boolean }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { register, handleSubmit, getValues, setValue, formState: { errors, isSubmitting } } = useForm<SetupFields>({ defaultValues: defaultValues() });

  useEffect(() => {
    void fetch("/api/v1/session").then(async (response) => {
      if (response.status === 401) {
        navigate(additionalEvent ? "/login" : "/signup", { replace: true });
        return;
      }
      if (!response.ok) throw new Error("Your account could not be loaded.");
      const current = await response.json() as SessionResponse;
      if (!additionalEvent && current.organizationMemberships.length) {
        navigate(current.recommendedPath, { replace: true });
        return;
      }
      setSession(current);
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Your account could not be loaded."));
  }, [additionalEvent, navigate]);

  const submit = handleSubmit(async (values) => {
    setMessage(null);
    const organization = session?.organizationMemberships[0];
    if (additionalEvent && !organization) {
      setMessage("Create an organization before adding another event.");
      return;
    }
    const event = {
      name: values.eventName,
      slug: values.eventSlug,
      startsOn: values.startsOn,
      endsOn: values.endsOn,
      timezone: values.timezone,
      location: values.location,
      primaryColor: values.primaryColor,
    };
    const endpoint = additionalEvent
      ? `/api/v1/organizer/organizations/${organization!.id}/events`
      : "/api/v1/onboarding";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(additionalEvent ? event : {
        organization: { name: values.organizationName, slug: values.organizationSlug },
        event,
      }),
    });
    const result = await response.json() as { recommendedPath?: string; error?: { message?: string } };
    if (!response.ok || !result.recommendedPath) {
      setMessage(result.error?.message ?? "The workspace could not be created.");
      return;
    }
    navigate(result.recommendedPath, { replace: true });
  });

  const fillSlug = (source: keyof SetupFields, target: keyof SetupFields) => {
    if (!getValues(target)) setValue(target, slugify(getValues(source)), { shouldValidate: true });
  };
  const Landmark = additionalEvent ? "section" : "main";

  return (
    <Landmark className="login-page onboarding-page">
      <section className="login-card onboarding-card">
        <div className="brand login-brand"><span>PF</span>ProgramFlow</div>
        <p className="eyebrow">{additionalEvent ? "New event" : "First-run setup"}</p>
        <h1>{additionalEvent ? "Create another program." : "Create your workspace."}</h1>
        <p>{additionalEvent ? `Add an event to ${session?.organizationMemberships[0]?.name ?? "your organization"}.` : "Start with an organization and one real event. You can change every program setting afterward."}</p>
        <form className="onboarding-form" onSubmit={submit}>
          {!additionalEvent ? <fieldset>
            <legend>Organization</legend>
            <label>Organization name<input {...register("organizationName", { required: true, minLength: 2, onBlur: () => fillSlug("organizationName", "organizationSlug") })} />{errors.organizationName ? <small>Enter your organization name.</small> : null}</label>
            <label>Organization URL<input placeholder="my-organization" {...register("organizationSlug", { required: true, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ })} />{errors.organizationSlug ? <small>Use lowercase letters, numbers, and hyphens.</small> : null}</label>
          </fieldset> : null}
          <fieldset>
            <legend>First event</legend>
            <label>Event name<input {...register("eventName", { required: true, minLength: 3, onBlur: () => fillSlug("eventName", "eventSlug") })} />{errors.eventName ? <small>Enter at least three characters.</small> : null}</label>
            <label>Public event URL<input placeholder="my-event-2027" {...register("eventSlug", { required: true, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ })} />{errors.eventSlug ? <small>Use lowercase letters, numbers, and hyphens.</small> : null}</label>
            <div className="onboarding-row">
              <label>Starts on<input type="date" {...register("startsOn", { required: true })} /></label>
              <label>Ends on<input type="date" {...register("endsOn", { required: true, validate: (value) => value >= getValues("startsOn") })} />{errors.endsOn ? <small>End date must follow the start date.</small> : null}</label>
            </div>
            <label>Location<input placeholder="Venue or Online" {...register("location", { required: true, minLength: 2 })} /></label>
            <div className="onboarding-row">
              <label>Timezone<input {...register("timezone", { required: true })} /></label>
              <label>Brand color<input type="color" {...register("primaryColor", { required: true })} /></label>
            </div>
          </fieldset>
          {message ? <div className="form-error" role="alert">{message}</div> : null}
          <button type="submit" disabled={isSubmitting || session === null}>{isSubmitting ? "Creating…" : additionalEvent ? "Create event" : "Create workspace"}</button>
        </form>
      </section>
    </Landmark>
  );
}

function defaultValues(): SetupFields {
  const starts = new Date();
  starts.setUTCDate(starts.getUTCDate() + 30);
  const ends = new Date(starts);
  ends.setUTCDate(ends.getUTCDate() + 1);
  return {
    organizationName: "",
    organizationSlug: "",
    eventName: "",
    eventSlug: "",
    startsOn: starts.toISOString().slice(0, 10),
    endsOn: ends.toISOString().slice(0, 10),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    location: "",
    primaryColor: "#7c5cff",
  };
}

function slugify(value: string): string {
  return value.trim().normalize("NFKD").toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}
