/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import "../setup-component";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Toast, type ToastData, type ToastVariant } from "@/components/ui/Toast";
import ToastProvider, { useToast } from "@/components/providers/ToastProvider";

function createToastData(
  variant: ToastVariant = "success",
  duration = 4000
): ToastData {
  return {
    id: "test-toast-1",
    message: "Test notification",
    variant,
    duration,
  };
}

describe("Toast Component", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with correct variant styles", () => {
    const variants: ToastVariant[] = ["success", "error", "warning", "info"];
    const icons: Record<ToastVariant, string> = {
      success: "\u2713",
      error: "\u2717",
      warning: "\u26A0",
      info: "\u2139",
    };

    for (const variant of variants) {
      const { unmount } = render(
        <Toast data={createToastData(variant)} onDismiss={vi.fn()} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass(
        `variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`
      );
      expect(alert).toHaveTextContent(icons[variant]);
      unmount();
    }
  });

  it("has role='alert'", () => {
    render(<Toast data={createToastData()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("can be manually dismissed via close button", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast data={createToastData("success", 0)} onDismiss={onDismiss} />
    );

    const closeBtn = screen.getByLabelText("Dismiss notification");
    fireEvent.click(closeBtn);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onDismiss).toHaveBeenCalledWith("test-toast-1");
  });

  it("auto-dismisses after configured duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast data={createToastData("success", 4000)} onDismiss={onDismiss} />
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onDismiss).toHaveBeenCalledWith("test-toast-1");
  });

  it("multiple toasts stack in ToastProvider", () => {
    function TestComponent() {
      const { addToast } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            addToast("Toast 1", "success");
            addToast("Toast 2", "error");
            addToast("Toast 3", "info");
          }}
        >
          Add Toasts
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Add Toasts"));
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(3);
  });

  it("useToast() hook returns addToast function", () => {
    function TestComponent() {
      const { addToast } = useToast();
      return (
        <button type="button" onClick={() => addToast("Hello toast", "success")}>
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.getByText("Hello toast")).toBeInTheDocument();
  });

  it("useToast() returns safe no-op outside provider", () => {
    function TestComponent() {
      const { addToast } = useToast();
      return (
        <button type="button" onClick={() => addToast("Should not appear", "success")}>
          Trigger
        </button>
      );
    }

    expect(() => {
      render(<TestComponent />);
    }).not.toThrow();

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders action button when toast has an action", () => {
    const onClick = vi.fn();
    const data: ToastData = {
      ...createToastData("success", 0),
      action: { label: "Undo", onClick },
    };

    render(<Toast data={data} onDismiss={vi.fn()} />);
    const actionBtn = screen.getByText("Undo");
    expect(actionBtn).toBeInTheDocument();
  });

  it("calls action onClick and dismisses when action button is clicked", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    const data: ToastData = {
      ...createToastData("success", 0),
      action: { label: "Undo", onClick },
    };

    render(<Toast data={data} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Undo"));

    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onDismiss).toHaveBeenCalledWith("test-toast-1");
  });

  it("does not render action button when toast has no action", () => {
    render(<Toast data={createToastData()} onDismiss={vi.fn()} />);
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("addToast with action renders toast with action button", () => {
    const onClick = vi.fn();

    function TestComponent() {
      const { addToast } = useToast();
      return (
        <button
          type="button"
          onClick={() => addToast("Item unwatched", "success", 5000, { label: "Undo", onClick })}
        >
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.getByText("Item unwatched")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });
});
