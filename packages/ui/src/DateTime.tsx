import React from "react";

type DateValue = string | Date;

function asDate(value: DateValue): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: DateValue): string {
  return asDate(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  });
}

interface FormattedDateTimeProps {
  value?: DateValue;
  fallback?: string;
  className?: string;
}

export function FormattedDateTime({
  value,
  fallback = "Not available",
  className,
}: FormattedDateTimeProps) {
  if (!value) return <span className={className}>{fallback}</span>;
  const date = asDate(value);
  return (
    <time className={className} dateTime={date.toISOString()}>
      {formatDateTime(date)}
    </time>
  );
}
