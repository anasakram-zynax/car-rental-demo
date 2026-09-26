import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "motion/react";

// ESM modules can't be spied with spyOn (non-configurable exports), so the
// reduced-motion hook is mocked at the module boundary. Default = motion on.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: vi.fn(() => false) };
});

import { CountUp } from "../count-up";

afterEach(() => {
  cleanup();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  window.localStorage.clear();
});

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

describe("CountUp (v2, direct-DOM rAF)", () => {
  it("renders the real value immediately when present (no provisional count)", async () => {
    render(<CountUp value={5000} format={fmtUSD} />);
    expect(screen.getByText("$5,000")).toBeTruthy();
  });

  it("renders a real 0 as 0 (a real answer, not provisional)", () => {
    render(<CountUp value={0} format={fmtUSD} />);
    expect(screen.getByText("$0")).toBeTruthy();
  });

  it("provisionally counts toward the cached fallback and HOLDS (never 0, never infinite)", async () => {
    window.localStorage.setItem("countup:metric-x", "4000");
    render(<CountUp cacheKey="metric-x" capValue={9000} format={fmtUSD} />);

    // The provisional loop drives textContent directly (outside React), so
    // wait for the DOM to reach the cached target and stay there.
    await waitFor(
      () => {
        expect(screen.getByText("$4,000")).toBeTruthy();
      },
      { timeout: 2500 }
    );
    // Hold: after the animation window it must not keep climbing.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("$4,000")).toBeTruthy();
  });

  it("counts toward capValue on a first visit (no cache) and stops there", async () => {
    render(<CountUp cacheKey="metric-y" capValue={1000} format={fmtUSD} />);
    await waitFor(
      () => {
        expect(screen.getByText("$1,000")).toBeTruthy();
      },
      { timeout: 2500 }
    );
  });

  it("snaps instantly to the real value when it arrives and caches it", async () => {
    window.localStorage.setItem("countup:metric-z", "4000");
    const { rerender } = render(<CountUp cacheKey="metric-z" capValue={9000} format={fmtUSD} />);

    await waitFor(() => expect(screen.getByText("$4,000")).toBeTruthy(), { timeout: 2500 });

    // Real value arrives LOWER than the provisional figure → instant snap.
    rerender(<CountUp value={2000} cacheKey="metric-z" capValue={9000} format={fmtUSD} />);
    expect(screen.getByText("$2,000")).toBeTruthy();
    expect(window.localStorage.getItem("countup:metric-z")).toBe("2000");
  });

  it("does not cache anything while the value is still provisional", async () => {
    render(<CountUp cacheKey="metric-w" capValue={777} format={fmtUSD} />);
    await new Promise((r) => setTimeout(r, 120)); // mid-animation
    expect(window.localStorage.getItem("countup:metric-w")).toBeNull();
  });

  it("respects reduced motion by landing directly on the fallback", async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    window.localStorage.setItem("countup:metric-rm", "321");
    render(<CountUp cacheKey="metric-rm" capValue={900} format={fmtUSD} />);
    await waitFor(() => expect(screen.getByText("$321")).toBeTruthy());
  });
});
