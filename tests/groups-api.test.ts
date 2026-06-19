import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    watchlistGroup: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAuth: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { GET } from "@/app/api/groups/route";

function createMockSession(userId: string) {
  return {
    user: { id: userId, steamId: "76561198000000000", name: "Test User" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

function createUnauthResult() {
  return {
    session: null,
    error: NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    ),
  };
}

describe("Groups API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(createUnauthResult());
  });

  it("counts only globally watched active group items", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-1"), error: null });
    vi.mocked(prisma.watchlistGroup.findMany).mockResolvedValue([
      {
        id: "group-1",
        name: "Investment",
        color: "#facc15",
        sortOrder: 0,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        _count: { items: 1 },
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(prisma.watchlistGroup.findMany).toHaveBeenCalledWith({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: {
            items: {
              where: {
                item: {
                  isActive: true,
                  isWatched: true,
                },
              },
            },
          },
        },
      },
    });
    expect(body).toMatchObject({
      success: true,
      data: {
        total: 1,
        groups: [{ id: "group-1", _count: { items: 1 } }],
      },
    });
  });
});
