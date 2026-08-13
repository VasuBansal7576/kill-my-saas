import { useId, useState, type InputHTMLAttributes } from "react";

export function PasswordInput({ label, help, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string }) {
  const generatedId = useId();
  const inputId = inputProps.id ?? generatedId;
  const helpId = help ? `${inputId}-help` : undefined;
  const [visible, setVisible] = useState(false);

  return <label htmlFor={inputId}>{label}<span className="password-control"><input {...inputProps} id={inputId} aria-describedby={[inputProps["aria-describedby"], helpId].filter(Boolean).join(" ") || undefined} type={visible ? "text" : "password"} /><button type="button" aria-controls={inputId} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"}</button></span>{help ? <small id={helpId} className="password-help">{help}</small> : null}</label>;
}
