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
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EventFormValues>();

  useEffect(() => {
    void fetch(`/api/v1/organizer/events/${eventSlug}/configuration`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<EventConfiguration>;
      })
      .then((configuration) => {
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
    reset(toFormValues(await response.json() as EventConfiguration));
    setState("saved");
  });

  return (
    <>
      <div className="page-head settings-head">
        <div><p className="eyebrow">Event configuration</p><h1>DevFlow Conf 2027</h1><p>Canonical dates, location, catalogs, and public brand.</p></div>
        <button className="primary-action" form="event-settings" disabled={state === "loading" || state === "saving"}>{state === "saving" ? "Saving…" : "Save changes"}</button>
      </div>
      {message ? <div className="form-error settings-error" role="alert">{message}</div> : null}
      {state === "saved" ? <div className="saved-notice" role="status">Changes persisted.</div> : null}
      <form className="settings-grid" id="event-settings" onSubmit={submit}>
        <section className="settings-section">
          <div className="section-head"><h2>Event details</h2><span>Required</span></div>
          <div className="form-grid">
            <label className="wide">Event name<input {...register("name", { required: true, minLength: 3 })} />{errors.name ? <small>Enter at least three characters.</small> : null}</label>
            <label>Starts on<input type="date" {...register("startsOn", { required: true })} /></label>
            <label>Ends on<input type="date" {...register("endsOn", { required: true })} /></label>
            <label className="wide">Location<input {...register("location", { required: true })} /></label>
            <label>Timezone<input {...register("timezone", { required: true })} /></label>
            <label>Primary color<input type="color" {...register("primaryColor", { required: true })} /></label>
          </div>
        </section>
        <section className="settings-section">
          <div className="section-head"><h2>Program catalogs</h2><span>One per line</span></div>
          <label>Tracks<textarea rows={5} {...register("tracks", { required: true })} /></label>
          <label>Formats <small>Name | minutes</small><textarea rows={6} {...register("formats", { required: true })} /></label>
          <label>Rooms<textarea rows={5} {...register("rooms", { required: true })} /></label>
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

