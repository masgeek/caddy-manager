import React, { useState } from "react";

interface JsonViewerProps {
  data: unknown;
  title?: string;
}

export function JsonViewer({ data, title }: JsonViewerProps) {
  const formatted = JSON.stringify(data, null, 2);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([formatted], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "caddy-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="json-viewer-toolbar">
        {title && <small className="json-viewer-title">{title}</small>}
        <div className="ms-auto">
          <button
            className="btn btn-sm btn-outline-light me-1"
            onClick={handleCopy}
            title="Copy"
            aria-label="Copy configuration"
          >
            <i className={`bi ${copied ? "bi-check2" : "bi-clipboard"}`}></i>
            <span className="ms-1">{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            className="btn btn-sm btn-outline-light"
            onClick={handleDownload}
            title="Download"
            aria-label="Download configuration"
          >
            <i className="bi bi-download"></i>
            <span className="ms-1">Download</span>
          </button>
        </div>
      </div>
      <pre
        className="json-viewer-code"
        style={{ maxHeight: "60vh", fontSize: "0.8rem" }}
      >
        {formatted}
      </pre>
    </div>
  );
}
