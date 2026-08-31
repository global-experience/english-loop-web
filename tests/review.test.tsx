import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewView } from "@/components/ReviewView";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

describe("ReviewView vocabulary", () => {
  it("shows phrases saved from the native translation sheet", async () => {
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (String(path).startsWith("/api/vocabulary")) {
        return Promise.resolve({
          items: [{
            expression_progress_id: "progress-1",
            id: "expression-1",
            canonical_text: "have to",
            korean_meaning: "~해야 한다",
            example_sentence: "I have to leave now.",
            current_stage: "NEW",
            next_review_at: null,
          }],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<ReviewView />);

    expect(await screen.findByRole("heading", { name: "내 단어장" })).toBeInTheDocument();
    expect(screen.getByText("have to")).toBeInTheDocument();
    expect(screen.getByText("I have to leave now.")).toBeInTheDocument();
  });
});
