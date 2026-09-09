import React from "react";

interface PageShellProps {
  children: React.ReactNode;
}

/** Shared page template boundary for consistent sizing and page-level layout. */
export function PageShell({ children }: PageShellProps) {
  return <div className="page-shell">{children}</div>;
}
