import { useEffect, useState } from "react";
import { Modal } from "@caddy-manager/ui";

export interface OperationState {
  title: string;
  message: string;
  status: "running" | "success" | "error";
}

export default function OperationModal({
  operation,
  onClose,
}: {
  operation: OperationState | null;
  onClose: () => void;
}) {
  const [fading, setFading] = useState(false);
  const isRunning = operation?.status === "running";
  const alertType =
    operation?.status === "success"
      ? "success"
      : operation?.status === "error"
        ? "danger"
        : "info";
  const icon =
    operation?.status === "success"
      ? "bi-check-lg"
      : operation?.status === "error"
        ? "bi-exclamation-lg"
        : "bi-arrow-repeat";

  useEffect(() => {
    setFading(false);
    if (!operation || isRunning) return;
    const fadeTimer = window.setTimeout(() => setFading(true), 4500);
    const closeTimer = window.setTimeout(onClose, 5000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [operation, isRunning]);

  return (
    <Modal
      open={!!operation}
      title={operation?.title ?? "Operation"}
      onClose={isRunning ? () => undefined : onClose}
      className={
        fading ? "operation-modal operation-modal-fading" : "operation-modal"
      }
      backdropClassName={
        fading
          ? "operation-backdrop operation-backdrop-fading"
          : "operation-backdrop"
      }
      footer={
        !isRunning ? (
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        ) : undefined
      }
    >
      <div
        className={`operation-status operation-status-${alertType}`}
        role="status"
      >
        <div className="operation-status-icon" aria-hidden="true">
          <i
            className={`bi ${icon} ${isRunning ? "operation-icon-spin" : ""}`}
          />
        </div>
        <div className="operation-status-copy">
          <strong>
            {isRunning
              ? "Working now"
              : operation?.status === "success"
                ? "Completed"
                : "Needs attention"}
          </strong>
          <span>{operation?.message}</span>
          {isRunning && (
            <div className="operation-progress" aria-hidden="true">
              <span />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
