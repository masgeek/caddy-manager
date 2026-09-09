import React from "react";
import { SignalStrip } from "./SignalStrip";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  signal?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  signal,
}: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <div className="page-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions}
      </div>
      {signal && <SignalStrip>{signal}</SignalStrip>}
    </div>
  );
}
