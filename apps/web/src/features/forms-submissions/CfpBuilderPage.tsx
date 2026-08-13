import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AccessibleDialog } from "../../app/AccessibleDialog";
import { eventDateTimeInputValue, eventLocalDateTimeToIso } from "../../app/event-time";
import "./forms-submissions.css";
import { readApi, type FieldType, type FormField, type FormWorkspace } from "./model";

type BuilderForm = NonNullable<FormWorkspace["form"]>;

export function CfpBuilderPage() {
  const { eventSlug = "" } = useParams();
  const [workspace, setWorkspace] = useState<FormWorkspace | null>(null);
  const [form, setForm] = useState<BuilderForm>(() => emptyForm());
  const [state, setState] = useState<"loading" | "idle" | "saving" | "publishing" | "saved" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/organizer/events/${eventSlug}/cfp`).then((response) => readApi<FormWorkspace>(response)).then((result) => {
      if (!active) return;
      setWorkspace(result);
      setForm(result.form ?? emptyForm());
      setState("idle");
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "The CFP form could not be loaded.");
      setState("error");
    });
    return () => { active = false; };
  }, [eventSlug]);

  const persist = async () => {
    setState("saving");
    setMessage(null);
    try {
      const path = workspace?.form
        ? `/api/v1/organizer/events/${eventSlug}/cfp/${workspace.form.id}`
        : `/api/v1/organizer/events/${eventSlug}/cfp`;
      const response = await fetch(path, {
        method: workspace?.form ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toRequest(form)),
      });
      const result = await readApi<FormWorkspace>(response);
      setWorkspace(result);
      setForm(result.form ?? form);
      setState("saved");
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The CFP form could not be saved.");
      setState("error");
      return null;
    }
  };

  const publish = async () => {
    const saved = await persist();
    if (!saved?.form) return;
    setState("publishing");
    try {
      const result = await readApi<FormWorkspace>(await fetch(
        `/api/v1/organizer/events/${eventSlug}/cfp/${saved.form.id}/publish`,
        { method: "POST" },
      ));
      setWorkspace(result);
      setForm(result.form ?? form);
      setState("saved");
      setMessage(`Published version ${result.form?.publishedVersion ?? ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The form could not be published.");
      setState("error");
    }
  };

  const patch = <Key extends keyof BuilderForm>(key: Key, value: BuilderForm[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const patchField = (index: number, change: Partial<FormField>) => patch("fields", form.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...change } : field));
  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.fields.length) return;
    const next = [...form.fields];
    [next[index], next[target]] = [next[target]!, next[index]!];
    patch("fields", next.map((field, sortOrder) => ({ ...field, sortOrder })));
  };
  const removeField = (index: number) => {
    patch("fields", form.fields.filter((_, fieldIndex) => fieldIndex !== index).map((item, sortOrder) => ({ ...item, sortOrder })));
    setRemoveTarget(null);
  };
  const requestFieldRemoval = (index: number) => {
    const field = form.fields[index];
    if (!field) return;
    if (fieldRemovalImpact(field, form.fields, workspace?.form?.fields ?? [])) setRemoveTarget(index);
    else removeField(index);
  };

  return (
    <div className="cfp-workspace">
      <div className="page-head cfp-page-head">
        <div>
          <p className="eyebrow">Call for speakers</p>
          <h1>{workspace?.event.name ?? "CFP form"}</h1>
          <p>Configure the public proposal form. Publishing saves the exact questions used for each proposal.</p>
        </div>
        <div className="cfp-actions">
          <a className="secondary-action" href={`/cfp/${eventSlug}`} target="_blank" rel="noreferrer">Preview form</a>
          <button type="button" className="secondary-action" disabled={state === "saving" || state === "publishing"} onClick={() => void persist()}>Save draft</button>
          <button type="button" className="primary-action" disabled={state === "saving" || state === "publishing"} onClick={() => void publish()}>{state === "publishing" ? "Publishing…" : "Publish changes"}</button>
        </div>
      </div>

      {message ? <div className={state === "error" ? "form-error" : "saved-notice"} role={state === "error" ? "alert" : "status"}>{message}</div> : null}
      {state === "loading" ? <p className="muted">Loading the form builder…</p> : (
        <div className="cfp-builder-grid">
          <section className="cfp-panel">
            <div className="section-head"><div><h2>Submission questions</h2><p>Questions appear in this order on the public form. Conditional questions stay hidden until their rule matches.</p></div><span>{form.fields.length} fields · ordered</span></div>
            <div className="cfp-field-list">
              {form.fields.map((field, index) => (
                <article className="cfp-builder-field" key={`${field.key}-${index}`}>
                  <div className="cfp-field-order" aria-label={`Position ${index + 1}`}>
                    <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} aria-label={`Move ${field.label} up`}>↑</button>
                    <span>{index + 1}</span>
                    <button type="button" onClick={() => moveField(index, 1)} disabled={index === form.fields.length - 1} aria-label={`Move ${field.label} down`}>↓</button>
                  </div>
                  <div className="cfp-field-editor">
                    <div className="cfp-field-summary">
                      <label>Question label<input value={field.label} onChange={(event) => patchField(index, { label: event.target.value })} /></label>
                      <label>Answer type<select value={field.type} onChange={(event) => patchField(index, { type: event.target.value as FieldType })}>{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label className="cfp-check"><input type="checkbox" checked={field.required} onChange={(event) => patchField(index, { required: event.target.checked })} /> Required</label>
                    </div>
                    {(field.type === "select" || field.type === "multi_select") ? <details className="cfp-field-disclosure"><summary>Answer choices</summary><label>Where choices come from <small>Use an event list, or enter one choice per line.</small><select aria-label={`${field.label} option source`} value={typeof field.settings.catalog === "string" ? field.settings.catalog : "custom"} onChange={(event) => patchField(index, { settings: event.target.value === "custom" ? { ...field.settings, catalog: undefined } : { ...field.settings, catalog: event.target.value as "track" | "format" } })}><option value="custom">Custom choices</option><option value="track">Event tracks</option><option value="format">Event formats</option></select>{!field.settings.catalog ? <textarea aria-label={`${field.label} options, one per line`} rows={3} value={(field.settings.options ?? []).join("\n")} onChange={(event) => patchField(index, { settings: { ...field.settings, options: lines(event.target.value) } })} /> : null}</label></details> : null}
                    <details className="cfp-field-disclosure cfp-field-advanced">
                      <summary>Advanced · display and reviewer routing</summary>
                      <p>Use these controls only when an answer should reveal this question or send a proposal to a particular reviewer group.</p>
                      <label>Internal question ID <small>Used by saved answers and conditions. Avoid changing it after proposals arrive.</small><input value={field.key} onChange={(event) => patchField(index, { key: slugKey(event.target.value) })} /></label>
                      {(field.type === "select" || field.type === "multi_select") ? <label>Send answers to reviewer groups <small>Write one choice and reviewer group per line. Example: Platform = Platform reviewers.</small><textarea aria-label={`${field.label} routing rules`} rows={2} value={formatRouting(field.settings.routeByValue)} onChange={(event) => patchField(index, { settings: { ...field.settings, routeByValue: parseRouting(event.target.value) } })} /></label> : null}
                      <div className="cfp-inline-grid"><label>Only show this question when<select value={field.condition?.fieldKey ?? ""} onChange={(event) => patchField(index, { condition: event.target.value ? { fieldKey: event.target.value, operator: "equals", value: "" } : null })}><option value="">Always show this question</option>{form.fields.filter((_, candidate) => candidate !== index).map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}</select></label>{field.condition ? <label>Answer is<input value={String(field.condition.value ?? "")} onChange={(event) => patchField(index, { condition: { ...field.condition!, value: event.target.value } })} /></label> : null}</div>
                    </details>
                  </div>
                  <button type="button" className="cfp-remove" aria-label={`Remove question ${field.label}`} onClick={() => requestFieldRemoval(index)}>Remove question</button>
                </article>
              ))}
            </div>
            <button type="button" className="cfp-add-field" onClick={() => patch("fields", [...form.fields, newField(form.fields.length)])}>+ Add question</button>
          </section>

          <aside className="cfp-settings-stack">
            <section className="cfp-panel">
              <div className="section-head"><div><h2>Form settings</h2><p>Public copy and submission window for this version.</p></div><span>{form.status}</span></div>
              <label>Internal form name<input value={form.name} onChange={(event) => patch("name", event.target.value)} /></label>
              <label>Collect<select value={form.target} onChange={(event) => patch("target", event.target.value as "abstract" | "session")}><option value="abstract">Review-stage abstract</option><option value="session">Full session</option></select></label>
              <div className="cfp-inline-grid">
                <label>Opens <small>{workspace?.event.timezone}</small><input type="datetime-local" value={eventDateTimeInputValue(form.opensAt, workspace?.event.timezone ?? "UTC")} onChange={(event) => patch("opensAt", eventLocalDateTimeToIso(event.target.value, workspace?.event.timezone ?? "UTC"))} /></label>
                <label>Closes <small>{workspace?.event.timezone}</small><input type="datetime-local" value={eventDateTimeInputValue(form.closesAt, workspace?.event.timezone ?? "UTC")} onChange={(event) => patch("closesAt", eventLocalDateTimeToIso(event.target.value, workspace?.event.timezone ?? "UTC"))} /></label>
              </div>
              <label>Welcome copy<textarea rows={3} value={form.welcomeCopy} onChange={(event) => patch("welcomeCopy", event.target.value)} /></label>
              <label>Instructions<textarea rows={4} value={form.instructionsCopy} onChange={(event) => patch("instructionsCopy", event.target.value)} /></label>
              <label>Success message<textarea rows={3} value={form.successCopy} onChange={(event) => patch("successCopy", event.target.value)} /></label>
            </section>
            <section className="cfp-panel">
              <div className="section-head"><div><h2>Participants and limits</h2><p>Counts include the required primary participant. One person must always be able to submit a valid proposal.</p></div><span>Server enforced</span></div>
              <div className="cfp-inline-grid">
                <label>Proposals per person <small>Submitted proposals allowed per speaker</small><input type="number" min={1} value={form.maxSubmissionsPerPerson ?? ""} onChange={(event) => patch("maxSubmissionsPerPerson", event.target.value ? Number(event.target.value) : null)} /></label>
                <label>Minimum people <small>Includes the primary participant</small><input type="number" min={1} max={form.maximumParticipants} value={form.minimumParticipants} onChange={(event) => patch("minimumParticipants", Number(event.target.value))} /></label>
                <label>Maximum people <small>Total people credited on a proposal</small><input type="number" min={form.minimumParticipants} value={form.maximumParticipants} onChange={(event) => patch("maximumParticipants", Number(event.target.value))} /></label>
              </div>
              {(["author", "co_author", "presenter"] as const).map((role) => <label key={role}>{role.replace("_", " ")} label<input value={form.participantRoleLabels[role]} onChange={(event) => patch("participantRoleLabels", { ...form.participantRoleLabels, [role]: event.target.value })} /></label>)}
              <Toggle label="Allow saved drafts" checked={form.allowDrafts} onChange={(value) => patch("allowDrafts", value)} />
              <Toggle label="Allow multiple drafts" checked={form.allowMultipleDrafts} onChange={(value) => patch("allowMultipleDrafts", value)} />
              <Toggle label="Count drafts toward the limit" checked={form.draftsCountTowardLimit} onChange={(value) => patch("draftsCountTowardLimit", value)} />
              <Toggle label="Allow submitted proposal edits while open" checked={form.allowSubmittedEdits} onChange={(value) => patch("allowSubmittedEdits", value)} />
              <Toggle label="Request a submitter confirmation email" checked={form.confirmationEmailEnabled} onChange={(value) => patch("confirmationEmailEnabled", value)} />
              <Toggle label="Queue a reminder for unfinished drafts" checked={form.draftReminderEnabled} onChange={(value) => patch("draftReminderEnabled", value)} />
              {form.draftReminderEnabled ? <label>Reminder lead time <small>hours before the close time</small><input type="number" min={1} max={720} value={form.draftReminderLeadHours} onChange={(event) => patch("draftReminderLeadHours", Number(event.target.value))} /></label> : null}
            </section>
          </aside>
        </div>
      )}
      {removeTarget !== null && form.fields[removeTarget] ? <AccessibleDialog close={() => setRemoveTarget(null)} titleId="remove-cfp-field-title" backdropClassName="submission-decision-backdrop" dialogClassName="submission-decision-dialog"><p className="eyebrow">Confirm question removal</p><h2 id="remove-cfp-field-title">Remove “{form.fields[removeTarget].label}”?</h2><p>{fieldRemovalImpact(form.fields[removeTarget], form.fields, workspace?.form?.fields ?? [])} Removing it can disconnect saved answers, display rules, or reviewer routing. This change is not persisted until you save the form.</p><footer><button data-dialog-initial-focus type="button" className="secondary-action" onClick={() => setRemoveTarget(null)}>Keep question</button><button type="button" className="primary-action danger" onClick={() => removeField(removeTarget)}>Remove question</button></footer></AccessibleDialog> : null}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="cfp-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function emptyForm(): BuilderForm {
  return {
    id: "",
    name: "Call for speakers",
    status: "draft",
    target: "abstract",
    opensAt: null,
    closesAt: null,
    welcomeCopy: "Share the work you want to bring to our community.",
    instructionsCopy: "Describe the audience, takeaways, and why this topic matters now.",
    successCopy: "Your proposal was received. You can return here while the call remains open.",
    allowDrafts: true,
    allowMultipleDrafts: true,
    draftsCountTowardLimit: false,
    allowSubmittedEdits: true,
    confirmationEmailEnabled: true,
    draftReminderEnabled: true,
    draftReminderLeadHours: 48,
    maxSubmissionsPerPerson: 3,
    minimumParticipants: 1,
    maximumParticipants: 4,
    participantRoleLabels: { author: "Primary author", co_author: "Co-author", presenter: "Presenter" },
    revision: 1,
    publishedVersion: null,
    fields: [
      { ...newField(0), key: "abstract", label: "Abstract", type: "long_text", required: true },
      { ...newField(1), key: "track", label: "Track", type: "select", required: true, settings: { catalog: "track" } },
      { ...newField(2), key: "format", label: "Format", type: "select", required: true, settings: { catalog: "format" } },
    ],
  };
}

function newField(sortOrder: number): FormField {
  return { key: `question_${sortOrder + 1}`, label: "New question", type: "short_text", required: false, sortOrder, settings: {}, condition: null };
}

const fieldTypes: Array<[FieldType, string]> = [
  ["short_text", "Short text"], ["long_text", "Long text"], ["select", "Dropdown"], ["multi_select", "Multi-select"], ["checkbox", "Checkbox"], ["date", "Date"],
];

function toRequest(form: BuilderForm) {
  return {
    name: form.name,
    target: form.target,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    welcomeCopy: form.welcomeCopy,
    instructionsCopy: form.instructionsCopy,
    successCopy: form.successCopy,
    allowDrafts: form.allowDrafts,
    allowMultipleDrafts: form.allowMultipleDrafts,
    draftsCountTowardLimit: form.draftsCountTowardLimit,
    allowSubmittedEdits: form.allowSubmittedEdits,
    confirmationEmailEnabled: form.confirmationEmailEnabled,
    draftReminderEnabled: form.draftReminderEnabled,
    draftReminderLeadHours: form.draftReminderLeadHours,
    maxSubmissionsPerPerson: form.maxSubmissionsPerPerson,
    minimumParticipants: form.minimumParticipants,
    maximumParticipants: form.maximumParticipants,
    participantRoleLabels: form.participantRoleLabels,
    revision: form.revision,
    fields: form.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      settings: field.settings,
      condition: field.condition,
    })),
  };
}

function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
function formatRouting(routes: Record<string, string> | undefined) { return Object.entries(routes ?? {}).map(([value, route]) => `${value} = ${route}`).join("\n"); }
function parseRouting(value: string) {
  return Object.fromEntries(lines(value).flatMap((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) return [];
    const option = line.slice(0, separator).trim();
    const route = line.slice(separator + 1).trim();
    return option && route ? [[option, route] as const] : [];
  }));
}
function slugKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function fieldRemovalImpact(field: FormField, fields: FormField[], persistedFields: FormField[]) {
  const impacts: string[] = [];
  if (persistedFields.some((candidate) => candidate.key === field.key)) impacts.push("This question is part of the saved form and may already have proposal answers.");
  if (Object.keys(field.settings.routeByValue ?? {}).length) impacts.push("Its answers route proposals to reviewer groups.");
  if (fields.some((candidate) => candidate.condition?.fieldKey === field.key)) impacts.push("Other questions depend on its answer.");
  return impacts.join(" ");
}
