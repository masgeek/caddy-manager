import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable, Modal, PageHeader, StatusBadge } from "@caddy-manager/ui";
import SiteFilters from "./components/SiteFilters";

describe("shared UI primitives", () => {
  it("renders a semantic status pill", () => {
    render(<StatusBadge status="active" />);

    expect(
      screen.getByText("Active").classList.contains("status-pill-active"),
    ).toBe(true);
  });

  it("closes on Escape and traps focus within the modal", () => {
    const onClose = vi.fn();
    render(
      <Modal
        open
        title="Edit site"
        onClose={onClose}
        footer={<button type="button">Save changes</button>}
      >
        <button type="button">First action</button>
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Edit site" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close dialog" }),
    );

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Save changes" }),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders shared page hierarchy and signal content", () => {
    render(
      <PageHeader
        eyebrow="Operations"
        title="Servers"
        description="Registered endpoints"
        signal={<strong>3 online</strong>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Servers" })).toBeTruthy();
    expect(screen.getByText("3 online")).toBeTruthy();
  });

  it("labels table pagination controls for keyboard users", () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={[{ field: "name", headerName: "Name" }]}
        rows={[{ id: "one", name: "One" }]}
        getRowId={(row) => row.id}
        totalCount={21}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("provides searchable route ID suggestions", () => {
    const onChange = vi.fn();
    render(
      <SiteFilters
        domains={[]}
        routeIds={["fee-syncer-dev", "fee-syncer-prod"]}
        servers={[]}
        serverBlocks={[]}
        statuses={[]}
        values={{
          domain: "",
          serverId: "",
          serverBlock: "",
          status: "",
          routeId: "",
        }}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", {
      name: "Filter by route ID",
    });
    expect(
      document.querySelector('datalist option[value="fee-syncer-dev"]'),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "fee-syncer-dev" } });
    expect(onChange).toHaveBeenCalledWith("routeId", "fee-syncer-dev");
  });
});
