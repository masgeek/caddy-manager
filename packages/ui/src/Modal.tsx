import React, { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  backdropClassName?: string;
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  size = "md",
  className,
  backdropClassName,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    open,
    onClose,
  ]);

  if (!open) return null;

  return (
    <>
      <div
        className={`modal-backdrop fade show ${backdropClassName ?? ""}`}
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className={`modal fade show d-block app-modal ${className ?? ""}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >
        <div
          className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size === "md" ? "" : `modal-${size}`}`}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 id="app-modal-title" className="modal-title">
                {title}
              </h5>
              <button
                ref={closeRef}
                type="button"
                className="btn-close"
                aria-label="Close dialog"
                onClick={onClose}
              />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
