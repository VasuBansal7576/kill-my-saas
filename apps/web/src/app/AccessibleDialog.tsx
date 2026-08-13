import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const focusable = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AccessibleDialog({
  children,
  close,
  label,
  titleId,
  backdropClassName,
  dialogClassName,
  initialFocus = "[data-dialog-initial-focus]",
}: {
  children: ReactNode;
  close(): void;
  label?: string;
  titleId?: string;
  backdropClassName?: string;
  dialogClassName?: string;
  initialFocus?: string;
}) {
  const generatedId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    restoreFocusRef.current?.blur();
    document.body.style.overflow = "hidden";
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    const dialog = dialogRef.current;
    const requested = dialog?.querySelector<HTMLElement>(initialFocus);
    const first = requested ?? dialog?.querySelector<HTMLElement>(focusable) ?? dialog;
    requestAnimationFrame(() => first?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-hidden");
      if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
    };
  }, [initialFocus]);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])]
      .filter((item) => item.offsetParent !== null);
    if (!items.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = items[0]!;
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) close();
  }

  const content = (
    <div className={["accessible-dialog-backdrop", backdropClassName].filter(Boolean).join(" ")} onMouseDown={onBackdropMouseDown}>
      <section
        ref={dialogRef}
        className={["accessible-dialog-surface", dialogClassName].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-dialog-id={generatedId}
      >
        {children}
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
