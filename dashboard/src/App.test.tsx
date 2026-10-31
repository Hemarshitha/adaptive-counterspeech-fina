import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});
describe("mocked UI connection states (no backend or real model)", () => {
  it("never renders invented candidates when connected with no persisted runs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("capabilities")
                ? { inference_configured: true }
                : { runs: [] },
            ),
            { status: 200 },
          ),
      ),
    );
    render(<App />);
    expect(
      await screen.findByText("Backend connected · inference configured"),
    ).toBeVisible();
    expect(
      screen.getByText("One input. Every decision, visible."),
    ).toBeVisible();
    expect(
      screen.queryByText("Selected response · human review required"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Run pipeline" })).toBeDisabled();
  });
  it("surfaces missing server access configuration and prevents submission", async () => {
    const mocked = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: { code: "dashboard_access_not_configured" },
          }),
          { status: 503 },
        ),
    );
    vi.stubGlobal("fetch", mocked);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "dashboard access not configured",
    );
    fireEvent.change(screen.getByLabelText("Comment to respond to"), {
      target: { value: "TEST input" },
    });
    expect(screen.getByRole("button", { name: "Run pipeline" })).toBeDisabled();
    expect(mocked.mock.calls).toHaveLength(2);
  });
  it("validates exact run IDs before requesting an invalid trace", async () => {
    const mocked = vi.fn(
      async () =>
        new Response(JSON.stringify({ runs: [], inference_configured: true })),
    );
    vi.stubGlobal("fetch", mocked);
    render(<App />);
    await screen.findByText("Backend connected · inference configured");
    fireEvent.change(screen.getByLabelText("Open exact trace"), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open run ID" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("valid UUID"),
    );
    expect(mocked.mock.calls).toHaveLength(2);
  });
});
