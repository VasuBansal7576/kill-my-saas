import type { EventConfiguration, EventConfigurationInput } from "@programflow/contracts";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";

type EventFormValues = Omit<EventConfigurationInput, "tracks" | "formats" | "rooms"> & {
  tracks: string;
  formats: string;
  rooms: string;
};

export function EventSettingsPage() {
  const { eventSlug = "" } = useParams();
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [eventName, setEventName] = useState("Event settings");
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EventFormValues>();

  useEffect(() => {
    void fetch(`/api/v1/organizer/events/${eventSlug}/configuration`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<EventConfiguration>;
      })
      .then((configuration) => {
        setEventName(configuration.name);
        reset(toFormValues(configuration));
        setState("idle");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Event configuration could not be loaded.");
        setState("error");
      });
  }, [eventSlug, reset]);

  const submit = handleSubmit(async (values) => {
    setState("saving");
    setMessage(null);
    const response = await fetch(`/api/v1/organizer/events/${eventSlug}/configuration`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toInput(values)),
    });
    if (!response.ok) {
      setMessage(await response.text());
      setState("error");
      return;
    }
    const configuration = await response.json() as EventConfiguration;
    setEventName(configuration.name);
    reset(toFormValues(configuration));
    setState("saved");
  });

  return (
    <>
      <div className="page-head settings-head">
        <div><p className="eyebrow">Event configuration</p><h1>{eventName}</h1><p>Canonical dates, location, catalogs, and public brand.</p></div>
        <button className="primary-action" form="event-settings" disabled={state === "loading" || state === "saving"}>{state === "saving" ? "Saving…" : "Save changes"}</button>
      </div>
      {message ? <div className="form-error settings-error" role="alert">{message}</div> : null}
      {state === "saved" ? <div className="saved-notice" role="status">Changes persisted.</div> : null}
      <form className="settings-grid" id="event-settings" onSubmit={submit}>
        <section className="settings-section">
          <div className="section-head"><h2>Event details</h2><span>Required</span></div>
          <div className="form-grid">
            <label className="wide" htmlFor="settings-name">Event name<input id="settings-name" {...validationAttributes(Boolean(errors.name), "settings-name")} {...register("name", { required: true, minLength: 3 })} />{errors.name ? <small id="settings-name-error">Enter at least three characters.</small> : null}</label>
            <label htmlFor="settings-starts-on">Starts on<input id="settings-starts-on" {...validationAttributes(Boolean(errors.startsOn), "settings-starts-on")} type="date" {...register("startsOn", { required: true })} />{errors.startsOn ? <small id="settings-starts-on-error">Choose a start date.</small> : null}</label>
            <label htmlFor="settings-ends-on">Ends on<input id="settings-ends-on" {...validationAttributes(Boolean(errors.endsOn), "settings-ends-on")} type="date" {...register("endsOn", { required: true })} />{errors.endsOn ? <small id="settings-ends-on-error">Choose an end date.</small> : null}</label>
            <label className="wide" htmlFor="settings-location">Location<input id="settings-location" {...validationAttributes(Boolean(errors.location), "settings-location")} {...register("location", { required: true })} />{errors.location ? <small id="settings-location-error">Enter a venue or Online.</small> : null}</label>
            <label htmlFor="settings-timezone">Timezone<input id="settings-timezone" {...validationAttributes(Boolean(errors.timezone), "settings-timezone")} {...register("timezone", { required: true })} />{errors.timezone ? <small id="settings-timezone-error">Enter an IANA timezone.</small> : null}</label>
            <label htmlFor="settings-primary-color">Primary color<input id="settings-primary-color" {...validationAttributes(Boolean(errors.primaryColor), "settings-primary-color")} type="color" {...register("primaryColor", { required: true })} />{errors.primaryColor ? <small id="settings-primary-color-error">Choose a primary color.</small> : null}</label>
          </div>
        </section>
        <section className="settings-section">
          <div className="section-head"><h2>Program catalogs</h2><span>One per line</span></div>
          <label htmlFor="settings-tracks">Tracks<textarea id="settings-tracks" {...validationAttributes(Boolean(errors.tracks), "settings-tracks")} rows={5} {...register("tracks", { required: true })} />{errors.tracks ? <small id="settings-tracks-error">Add at least one track.</small> : null}</label>
          <label htmlFor="settings-formats">Formats <small>Name | minutes</small><textarea id="settings-formats" {...validationAttributes(Boolean(errors.formats), "settings-formats")} rows={6} {...register("formats", { required: true })} />{errors.formats ? <small id="settings-formats-error">Add at least one format and duration.</small> : null}</label>
          <label htmlFor="settings-rooms">Rooms<textarea id="settings-rooms" {...validationAttributes(Boolean(errors.rooms), "settings-rooms")} rows={5} {...register("rooms", { required: true })} />{errors.rooms ? <small id="settings-rooms-error">Add at least one room.</small> : null}</label>
        </section>
      </form>
    </>
  );
}

function toFormValues(configuration: EventConfiguration): EventFormValues {
  return {
    name: configuration.name,
    startsOn: configuration.startsOn,
    endsOn: configuration.endsOn,
    timezone: configuration.timezone,
    location: configuration.location,
    primaryColor: configuration.primaryColor,
    tracks: configuration.tracks.join("\n"),
    formats: configuration.formats.map((format) => `${format.name} | ${format.durationMinutes}`).join("\n"),
    rooms: configuration.rooms.join("\n"),
  };
}

function toInput(values: EventFormValues): EventConfigurationInput {
  const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    ...values,
    tracks: lines(values.tracks),
    formats: lines(values.formats).map((line) => {
      const [name = "", minutes = "0"] = line.split("|").map((part) => part.trim());
      return { name, durationMinutes: Number(minutes) };
    }),
    rooms: lines(values.rooms),
  };
}

function validationAttributes(invalid: boolean, id: string) {
  return { "aria-invalid": invalid || undefined, "aria-describedby": invalid ? `${id}-error` : undefined } as const;
}
