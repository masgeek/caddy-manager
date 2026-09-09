import React from "react";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
  return <span className={`status-pill status-pill-${status}`}>{label}</span>;
}
