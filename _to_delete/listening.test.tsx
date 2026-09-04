import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListeningPlayer } from "@/components/ListeningPlayer";
import { listeningActivity, today } from "./fixtures";

const apiMock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", async () => ({ apiFetch: (...args: unknown[]) => apiMock(...args), mediaUrl: (path: string) => path }));

describe("ListeningPlayer", () => {
  beforeEach(() => apiMock.mockClear());

  it("provides a large play control and speed choices", async () => {
    render(<ListeningPlayer activity={listeningActivity} expressions={today.plan!.target_expressions} title="MORNING" onComplete={vi.fn()}/>);
    const play = screen.getByLabelText("재생");
    expect(play).toHaveClass("play-button");
    fireEvent.change(screen.getByLabelText("재생 속도"), { target: { value: "0.75" } });
    expect(screen.getByLabelText("재생 속도")).toHaveValue("0.75");
    fireEvent.click(play);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/activities/a1/start", { method: "POST" }));
  });

  it("toggles the transcript and records shadowing", async () => {
    render(<ListeningPlayer activity={listeningActivity} expressions={today.plan!.target_expressions} title="MORNING" onComplete={vi.fn()}/>);
    expect(screen.getByText(/대본을 숨겼어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /영어 대본/ }));
    expect(await screen.findByText(/The main challenge was/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /입 모양 쉐도잉/ }));
    await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalled();
  });

  it("enables one-sentence repeat", () => {
    render(<ListeningPlayer activity={listeningActivity} expressions={today.plan!.target_expressions} title="MORNING" onComplete={vi.fn()}/>);
    const repeat = screen.getByRole("button", { name: /한 문장/ });
    fireEvent.click(repeat);
    expect(repeat).toHaveAttribute("aria-pressed", "true");
  });
});

