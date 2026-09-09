import React from "react";

export interface Column<T> {
  field: keyof T | string;
  headerName: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  width?: number;
}
