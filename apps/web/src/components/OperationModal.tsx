import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { notificationConfig } from "../config/notifications";

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
  const toastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!operation) return;

    const id = toastId.current ?? `${operation.title}-${Date.now()}`;
    toastId.current = id;
    const message = `${operation.title}: ${operation.message}`;

    if (operation.status === "running") {
      toast.loading(message, { id });
      return;
    }

    const show = operation.status === "success" ? toast.success : toast.error;
    show(message, { id, duration: notificationConfig.delay });
    const closeTimer = window.setTimeout(onClose, notificationConfig.delay);
    return () => window.clearTimeout(closeTimer);
  }, [operation, onClose]);

  return null;
}
