import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogCardSkeleton, CatalogRowSkeleton, CatalogSkeleton, FeedCatalog } from "@/components/feed/FeedCatalog";
import { fetchCatalogPage } from "@/lib/catalog";

vi.mock("@/lib/catalog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/catalog")>("@/lib/catalog");
  return {
    ...actual,
    fetchCatalogPage: vi.fn(),
    fetchCategoryPage: vi.fn(),
  };
});

describe("FeedCatalog Skeleton UI & React Query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class IntersectionObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  it("CatalogCardSkeleton renders thumb, play placeholder, duration pill, and text lines", () => {
    const { container } = render(<CatalogCardSkeleton />);
    const card = container.querySelector(".catalog-card.catalog-card-skeleton");
    expect(card).toBeTruthy();
    expect(card?.querySelector(".catalog-card-thumb.skeleton-shimmer")).toBeTruthy();
    expect(card?.querySelector(".catalog-skeleton-play")).toBeTruthy();
    expect(card?.querySelector(".catalog-skeleton-pill")).toBeTruthy();
    expect(card?.querySelector(".catalog-skeleton-line.title-1")).toBeTruthy();
    expect(card?.querySelector(".catalog-skeleton-line.title-2")).toBeTruthy();
    expect(card?.querySelector(".catalog-skeleton-line.channel")).toBeTruthy();
  });

  it("CatalogRowSkeleton renders header titles, nav buttons, and card track matching cardCount", () => {
    const { container } = render(<CatalogRowSkeleton titleWidth={150} descWidth={200} cardCount={4} />);
    const row = container.querySelector(".catalog-row.catalog-row-skeleton");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".catalog-skeleton-head-title")).toBeTruthy();
    expect(row?.querySelector(".catalog-skeleton-head-desc")).toBeTruthy();
    const navButtons = row?.querySelectorAll(".catalog-skeleton-nav-btn");
    expect(navButtons?.length).toBe(2);
    const cards = row?.querySelectorAll(".catalog-card-skeleton");
    expect(cards?.length).toBe(4);
  });

  it("CatalogSkeleton renders 3 staggered category rows", () => {
    const { container } = render(<CatalogSkeleton />);
    const group = container.querySelector(".catalog-skeleton-group");
    expect(group).toBeTruthy();
    const rows = container.querySelectorAll(".catalog-row-skeleton");
    expect(rows.length).toBe(3);
    const allCards = container.querySelectorAll(".catalog-card-skeleton");
    expect(allCards.length).toBe(15);
  });

  it("FeedCatalog displays CatalogSkeleton while initially loading catalog data", async () => {
    // Return pending promise to observe loading state
    let resolvePromise: (value: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(fetchCatalogPage).mockReturnValue(pendingPromise as any);

    const { container } = render(<FeedCatalog onClose={vi.fn()} onOpenVideo={vi.fn()} />);

    // While loading, CatalogSkeleton should be in the DOM
    const skeletonGroup = container.querySelector(".catalog-skeleton-group");
    expect(skeletonGroup).toBeTruthy();
    expect(container.querySelectorAll(".catalog-card-skeleton").length).toBeGreaterThanOrEqual(15);

    // Resolve promise
    await act(async () => {
      resolvePromise!({ rows: [], next_cursor: null, seed: "seed", total: 0 });
    });
  });

  it("triggers pull-to-refresh on FeedCatalog, displays skeleton while refreshing, and calls done", async () => {
    let resolveRefresh: (value: any) => void;
    const initialData = {
      rows: [
        {
          category: { id: "cat-1", slug: "daily", label: "일상 회화", description: "매일 쓰는 표현" },
          items: [
            {
              id: "v-1",
              title: "Morning Routine",
              channel_title: "English Daily",
              duration_seconds: 120,
              thumbnail_url: "https://example.com/thumb.jpg",
              caption_available: true,
              saved_status: null,
            },
          ],
          next_cursor: null,
          total: 1,
        },
      ],
      next_cursor: null,
      seed: "seed-1",
      total: 1,
    };

    vi.mocked(fetchCatalogPage).mockResolvedValueOnce(initialData as any);

    const { container } = render(<FeedCatalog onClose={vi.fn()} onOpenVideo={vi.fn()} />);

    // Wait for initial data to render
    expect(await screen.findByText("일상 회화")).toBeInTheDocument();
    expect(screen.getByText("Morning Routine")).toBeInTheDocument();

    // Setup pull refresh pending promise
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    vi.mocked(fetchCatalogPage).mockReturnValueOnce(refreshPromise as any);

    // Dispatch pull-refresh event
    const doneMock = vi.fn();
    act(() => {
      window.dispatchEvent(
        new CustomEvent("loopine:pull-refresh", { detail: { tab: "feed", done: doneMock } })
      );
    });

    // While pull-refreshing, skeleton UI should be displayed
    expect(container.querySelector(".catalog-skeleton-group")).toBeInTheDocument();

    // Complete refresh
    await act(async () => {
      resolveRefresh!({
        ...initialData,
        rows: [
          {
            ...initialData.rows[0],
            items: [
              {
                ...initialData.rows[0].items[0],
                title: "Refreshed Routine",
              },
            ],
          },
        ],
      });
    });

    expect(doneMock).toHaveBeenCalled();
    expect(await screen.findByText("Refreshed Routine")).toBeInTheDocument();
  });
});
