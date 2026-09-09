import React from "react";
import type { Column } from "./types";
import { Pagination } from "./Pagination";

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  getRowId: (row: T) => string;
  groupBy?: (row: T) => string;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  page = 0,
  pageSize = 20,
  totalCount,
  onPageChange,
  groupBy,
}: DataTableProps<T>) {
  let previousGroup: string | undefined;
  return (
    <div>
      <div className="table-responsive">
        <table className="table table-sm table-striped">
          <thead className="table-light">
            <tr>
              {columns.map((col) => (
                <th key={String(col.field)} scope="col">
                  {col.headerName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-muted py-3"
                >
                  No data
                </td>
              </tr>
            ) : (
              rows.flatMap((row) => {
                const group = groupBy?.(row);
                const groupRow =
                  group && group !== previousGroup ? (
                    <tr className="table-group-row" key={`group-${group}`}>
                      <th colSpan={columns.length} scope="rowgroup">
                        {group}
                      </th>
                    </tr>
                  ) : null;
                previousGroup = group;
                return [
                  groupRow,
                  <tr key={getRowId(row)}>
                    {columns.map((col) => (
                      <td key={String(col.field)}>
                        {col.render
                          ? col.render(row[col.field as keyof T], row)
                          : String(row[col.field as keyof T] ?? "")}
                      </td>
                    ))}
                  </tr>,
                ].filter(Boolean);
              })
            )}
          </tbody>
        </table>
      </div>
      {totalCount !== undefined && onPageChange && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
