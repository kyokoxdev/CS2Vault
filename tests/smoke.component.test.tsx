/**
 * Smoke Test: Basic Component Rendering
 * Verifies that React Testing Library and jsdom environment are properly configured
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest";
import "../tests/setup-component";
import { render, screen } from "@testing-library/react";

describe("Smoke Test", () => {
    it("renders a simple component in jsdom environment", () => {
        const TestComponent = () => <div>Hello</div>;
        render(<TestComponent />);
        expect(screen.getByText("Hello")).toBeInTheDocument();
    });
});
