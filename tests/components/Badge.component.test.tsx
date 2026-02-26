/**
 * Badge Component Tests
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest";
import "../setup-component";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge Component", () => {
  it("renders children correctly", () => {
    render(<Badge variant="success">Success</Badge>);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("applies success variant with bull color", () => {
    const { container } = render(<Badge variant="success">Active</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/success/);
  });

  it("applies danger variant with bear color", () => {
    const { container } = render(<Badge variant="danger">Inactive</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/danger/);
  });

  it("applies warning variant", () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/warning/);
  });

  it("applies neutral variant", () => {
    const { container } = render(<Badge variant="neutral">Neutral</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/neutral/);
  });

  it("applies info variant", () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/info/);
  });

  it("applies sm size variant", () => {
    const { container } = render(
      <Badge variant="success" size="sm">
        Small
      </Badge>
    );
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/sizeSm/);
  });

  it("applies md size by default", () => {
    const { container } = render(<Badge variant="success">Medium</Badge>);
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/sizeMd/);
  });

  it("applies md size explicitly", () => {
    const { container } = render(
      <Badge variant="success" size="md">
        Medium
      </Badge>
    );
    const badge = container.querySelector("span");
    expect(badge?.className).toMatch(/sizeMd/);
  });
});
