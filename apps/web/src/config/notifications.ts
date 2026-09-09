import type { ToastPosition } from "react-hot-toast";

export const notificationConfig = {
  position: "top-right" as ToastPosition,
  delay: 5000,
  gutter: 12,
} as const;
