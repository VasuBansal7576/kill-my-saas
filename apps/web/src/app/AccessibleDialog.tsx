import {
  useEffect,
  useId,
  useLayoutEffect,
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
  const restoreFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const dialog = dialogRef.current;
    const restoreFocus = restoreFocusRef.current;
    const previousDialog = [...document.querySelectorAll<HTMLElement>("[data-dialog-id]")]
      .filter((candidate) => candidate !== dialog)
      .at(-1) ?? null;
    const previousOverflow = document.body.style.overflow;
    restoreFocusRef.current?.blur();
    document.body.style.overflow = "hidden";
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    previousDialog?.setAttribute("inert", "");
    previousDialog?.setAttribute("aria-hidden", "true");
    const requested = dialog?.querySelector<HTMLElement>(initialFocus);
    const first = requested ?? dialog?.querySelector<HTMLElement>(focusable) ?? dialog;
    first?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const topDialog = [...document.querySelectorAll<HTMLElement>("[data-dialog-id]")].at(-1);
      if (topDialog !== dialog) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape, true);
      document.body.style.overflow = previousOverflow;
      const anotherDialogIsOpen = [...document.querySelectorAll<HTMLElement>("[data-dialog-id]")]
        .some((candidate) => candidate !== dialog);
      if (!anotherDialogIsOpen) {
        root?.removeAttribute("inert");
        root?.removeAttribute("aria-hidden");
      }
      previousDialog?.removeAttribute("inert");
      previousDialog?.removeAttribute("aria-hidden");
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [initialFocus]);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
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
