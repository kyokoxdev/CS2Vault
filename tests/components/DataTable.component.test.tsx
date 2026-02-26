/**
 * DataTable Component Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import "../setup-component";
import { render, screen } from "@testing-library/react";
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
