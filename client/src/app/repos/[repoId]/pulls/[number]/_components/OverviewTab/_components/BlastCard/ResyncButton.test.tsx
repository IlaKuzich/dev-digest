/* ResyncButton — the resync round-trip: POST /resync (async 202) → poll
   /index-state → invalidate this PR's blast once `lastIndexedSha` advances.

   The sha IS the completion signal (status is "full" both before and after a
   resync), so these tests drive `lastIndexedSha` directly. `fireEvent` rather
   than `userEvent`: the latter is not a dependency of this package
   (client INSIGHTS.md:40). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const resyncMutate = vi.fn();
let resyncState: { mutate: () => void; isPending: boolean; isError: boolean };
let indexState: { data: { lastIndexedSha: string } | undefined };
const invalidateQueries = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => resyncState,
  useRepoIntelStatus: () => indexState,
}));

import { ResyncButton } from "./ResyncButton";

beforeEach(() => {
  resyncMutate.mockClear();
  invalidateQueries.mockClear();
  resyncState = { mutate: resyncMutate, isPending: false, isError: false };
  indexState = { data: { lastIndexedSha: "sha-old" } };
});

afterEach(cleanup);

describe("ResyncButton", () => {
  it("fires the resync and shows it is working", () => {
    render(<ResyncButton prId="pr1" />);

    const button = screen.getByRole("button", { name: /resync the repository index/i });
    expect(button).toHaveTextContent("Resync repo");

    fireEvent.click(button);

    expect(resyncMutate).toHaveBeenCalledTimes(1);
    // Busy state comes from the poll being armed, not from the mutation: the
    // POST returns 202 immediately while the job is still queued.
    expect(screen.getByRole("button", { name: /resync the repository index/i })).toHaveTextContent(
      "Resyncing…",
    );
  });

  it("refetches the blast map once the index advances to a new sha", async () => {
    const { rerender } = render(<ResyncButton prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /resync the repository index/i }));

    // Still on the old sha — the job has not landed, so the map must NOT be
    // refetched yet or the card re-renders the same empty result.
    expect(invalidateQueries).not.toHaveBeenCalled();

    // The resync job finished and wrote a new index row.
    indexState = { data: { lastIndexedSha: "sha-new" } };
    rerender(<ResyncButton prId="pr1" />);

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
    });

    // Polling stops once it has advanced.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /resync the repository index/i })).toHaveTextContent(
        "Resync repo",
      );
    });
  });

  it("surfaces a failed POST without touching the map", () => {
    resyncState = { mutate: resyncMutate, isPending: false, isError: true };
    render(<ResyncButton prId="pr1" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't start the resync/i);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  // A degraded resync (no_clone / sync_failed) still returns 202, so the sha
  // simply never moves and nothing re-renders. Regression guard: the deadline
  // was once a `Date.now()` check inside the sha-watching effect, which could
  // never fire on this path — the effect's deps never changed, so the button
  // span forever with no error.
  it("gives up instead of spinning forever when the sha never advances", async () => {
    vi.useFakeTimers();
    try {
      render(<ResyncButton prId="pr1" />);
      fireEvent.click(screen.getByRole("button", { name: /resync the repository index/i }));
      expect(screen.getByRole("button", { name: /resync/i })).toHaveTextContent("Resyncing…");

      // Nothing else happens — no new sha, no re-render. Only the clock moves.
      await act(async () => {
        vi.advanceTimersByTime(61_000);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(screen.getByRole("alert")).toHaveTextContent(/didn't advance/i);
    expect(invalidateQueries).not.toHaveBeenCalled();
    // …and it is clickable again, not stuck in the busy state.
    expect(screen.getByRole("button", { name: /resync/i })).toHaveTextContent("Resync repo");
  });
});
