/**
 * DataTable Component Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import "../setup-component";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable, Column } from "@/components/ui/DataTable";

interface TestRow {
  id: string;
  name: string;
  price: number;
}

const testColumns: Column<TestRow>[] = [
  { key: "id", header: "ID" },
  { key: "name", header: "Name" },
  { key: "price", header: "Price", align: "right" },
];

const testData: TestRow[] = [
  { id: "1", name: "Item A", price: 100 },
  { id: "2", name: "Item B", price: 200 },
];

describe("DataTable Component", () => {
  it("renders table headers correctly", () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
  });

  it("renders data rows correctly", () => {
    render(<DataTable columns={testColumns} data={testData} />);
    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("shows empty message when data is empty", () => {
    render(<DataTable columns={testColumns} data={[]} />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("shows custom empty message when data is empty", () => {
    render(
      <DataTable
        columns={testColumns}
        data={[]}
        emptyMessage="Custom empty state"
      />
    );
    expect(screen.getByText("Custom empty state")).toBeInTheDocument();
  });

  it("fires onRowClick when row is clicked", () => {
    const onRowClick = vi.fn();

    const { container } = render(
      <DataTable
        columns={testColumns}
        data={testData}
        onRowClick={onRowClick}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    (rows[0] as HTMLElement).click();

    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it("renders loading state with skeleton rows", () => {
    const { container } = render(
      <DataTable columns={testColumns} data={testData} isLoading={true} />
    );

    const skeletonRows = container.querySelectorAll("[class*='skeletonRow']");
    expect(skeletonRows.length).toBe(5);
  });

  it("applies render function to cells", () => {
    const columnsWithRender: Column<TestRow>[] = [
      { key: "id", header: "ID" },
      {
        key: "price",
        header: "Price",
        render: (value) => `$${value}`,
      },
    ];

    render(<DataTable columns={columnsWithRender} data={testData} />);
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("$200")).toBeInTheDocument();
  });

  it("applies column width styles", () => {
    const columnsWithWidth: Column<TestRow>[] = [
      { key: "id", header: "ID", width: "100px" },
      { key: "name", header: "Name" },
      { key: "price", header: "Price", width: "150px" },
    ];

    const { container } = render(
      <DataTable columns={columnsWithWidth} data={testData} />
    );

    const headers = container.querySelectorAll("th");
    expect(headers[0]).toHaveStyle("width: 100px");
    expect(headers[2]).toHaveStyle("width: 150px");
  });
});

describe("DataTable Sorting", () => {
  const sortableColumns: Column<TestRow>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name", sortable: true },
    { key: "price", header: "Price", align: "right", sortable: true },
  ];

  const sortTestData: TestRow[] = [
    { id: "1", name: "Zeta", price: 300 },
    { id: "2", name: "Alpha", price: 100 },
    { id: "3", name: "Mu", price: 200 },
  ];

  it("sortable columns render sort indicators", () => {
    render(<DataTable columns={sortableColumns} data={sortTestData} />);

    const headers = screen.getAllByRole("columnheader");
    // Name and Price are sortable — should show neutral ⇅
    expect(headers[1]).toHaveTextContent("⇅");
    expect(headers[2]).toHaveTextContent("⇅");
    // ID is not sortable — no indicator
    expect(headers[0]).not.toHaveTextContent("⇅");
  });

  it("click-to-sort toggles asc → desc → neutral", () => {
    const { container } = render(
      <DataTable columns={sortableColumns} data={sortTestData} />
    );
    const nameHeader = screen.getAllByRole("columnheader")[1];

    // Original order: Zeta, Alpha, Mu
    let rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Zeta");
    expect(rows[1]).toHaveTextContent("Alpha");
    expect(rows[2]).toHaveTextContent("Mu");

    // Click 1: ascending → Alpha, Mu, Zeta
    fireEvent.click(nameHeader);
    rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Alpha");
    expect(rows[1]).toHaveTextContent("Mu");
    expect(rows[2]).toHaveTextContent("Zeta");

    // Click 2: descending → Zeta, Mu, Alpha
    fireEvent.click(nameHeader);
    rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Zeta");
    expect(rows[1]).toHaveTextContent("Mu");
    expect(rows[2]).toHaveTextContent("Alpha");

    // Click 3: neutral → original order
    fireEvent.click(nameHeader);
    rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Zeta");
    expect(rows[1]).toHaveTextContent("Alpha");
    expect(rows[2]).toHaveTextContent("Mu");
  });

  it("non-sortable columns don't respond to clicks", () => {
    const { container } = render(
      <DataTable columns={sortableColumns} data={sortTestData} />
    );
    const headers = screen.getAllByRole("columnheader");
    const idHeader = headers[0]; // ID is not sortable

    fireEvent.click(idHeader);

    // Data order unchanged
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveTextContent("Zeta");
    expect(rows[1]).toHaveTextContent("Alpha");
    expect(rows[2]).toHaveTextContent("Mu");

    // No sort indicators appear on non-sortable header
    expect(idHeader).not.toHaveTextContent("▲");
    expect(idHeader).not.toHaveTextContent("▼");
    expect(idHeader).not.toHaveTextContent("⇅");
  });

  it("skeleton rows use correct colSpan", () => {
    const { container } = render(
      <DataTable columns={sortableColumns} data={[]} isLoading={true} />
    );
    const skeletonTd = container.querySelector("tbody td");
    expect(skeletonTd).toHaveAttribute(
      "colspan",
      String(sortableColumns.length)
    );
  });

  it("no role='button' on clickable rows", () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        columns={sortableColumns}
        data={sortTestData}
        onRowClick={onRowClick}
      />
    );
    const rows = container.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      expect(row).not.toHaveAttribute("role", "button");
    });
  });

  it("aria-sort attribute on sorted header", () => {
    render(<DataTable columns={sortableColumns} data={sortTestData} />);
    const nameHeader = screen.getAllByRole("columnheader")[1];

    // Initially "none"
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    // Click 1: ascending
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    // Click 2: descending
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });
});
