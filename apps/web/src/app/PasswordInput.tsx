import { useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

export function PasswordInput({ label, help, ...inputProps }: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string }) {
  const generatedId = useId();
  const inputId = inputProps.id ?? generatedId;
  const helpId = help ? `${inputId}-help` : undefined;
  const capsLockId = `${inputId}-caps-lock`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return <label htmlFor={inputId}>{label}<span className="password-control"><input {...inputProps} id={inputId} aria-describedby={[inputProps["aria-describedby"], helpId, capsLock ? capsLockId : undefined].filter(Boolean).join(" ") || undefined} type={visible ? "text" : "password"} onBlur={(event) => { setCapsLock(false); inputProps.onBlur?.(event); }} onKeyDown={(event) => { updateCapsLock(event); inputProps.onKeyDown?.(event); }} onKeyUp={(event) => { updateCapsLock(event); inputProps.onKeyUp?.(event); }} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-controls={inputId} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"}</button></span>{help ? <small id={helpId} className="password-help">{help}</small> : null}{capsLock ? <small id={capsLockId} className="password-caps-lock" role="status">Caps Lock is on.</small> : null}</label>;
}
