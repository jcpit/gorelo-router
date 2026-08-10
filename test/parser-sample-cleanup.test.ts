import { describe, expect, it, vi } from "vitest";
import { deleteExpiredParserSampleObjects } from "../src/index";

interface ListedObject {
  key: string;
  uploaded: Date;
}

interface ListPage {
  objects: ListedObject[];
  truncated: boolean;
  cursor?: string;
}

function archiveBucket(pages: Record<string, ListPage>): {
  bucket: R2Bucket;
  list: ReturnType<typeof vi.fn>;
  deleteObjects: ReturnType<typeof vi.fn>;
} {
  const list = vi.fn(
    async (options: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<R2Objects> => {
      const page = pages[options.cursor ?? "first"];
      if (!page) throw new Error("Unexpected R2 listing cursor");
      return page as unknown as R2Objects;
    },
  );
  const deleteObjects = vi.fn(async (_keys: string | string[]) => undefined);
  return {
    bucket: {
      list,
      delete: deleteObjects,
    } as unknown as R2Bucket,
    list,
    deleteObjects,
  };
}

describe("parser sample object cleanup", () => {
  it("does nothing when private object storage is not configured", async () => {
    await expect(
      deleteExpiredParserSampleObjects(
        undefined,
        new Date("2026-08-10T02:00:00.000Z"),
      ),
    ).resolves.toBe(0);
  });

  it("deletes expired parser samples without disturbing live or unrelated objects", async () => {
    const { bucket, list, deleteObjects } = archiveBucket({
      first: {
        objects: [
          {
            key: "parser-samples/orphan.json",
            uploaded: new Date("2026-08-10T01:59:59.999Z"),
          },
          {
            key: "parser-samples/at-cutoff.json",
            uploaded: new Date("2026-08-10T02:00:00.000Z"),
          },
          {
            key: "parser-samples/live.json",
            uploaded: new Date("2026-08-10T02:00:00.001Z"),
          },
          {
            key: "messages/unrelated.eml",
            uploaded: new Date("2026-08-01T00:00:00.000Z"),
          },
        ],
        truncated: false,
      },
    });

    await expect(
      deleteExpiredParserSampleObjects(
        bucket,
        new Date("2026-08-10T02:00:00.000Z"),
      ),
    ).resolves.toBe(2);

    expect(list).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledWith({
      prefix: "parser-samples/",
      limit: 1_000,
    });
    expect(deleteObjects).toHaveBeenCalledOnce();
    expect(deleteObjects).toHaveBeenCalledWith([
      "parser-samples/orphan.json",
      "parser-samples/at-cutoff.json",
    ]);
  });

  it("walks every R2 page and deletes expired orphans in batches", async () => {
    const { bucket, list, deleteObjects } = archiveBucket({
      first: {
        objects: [
          {
            key: "parser-samples/live.json",
            uploaded: new Date("2026-08-10T03:00:00.000Z"),
          },
        ],
        truncated: true,
        cursor: "opaque-page-2",
      },
      "opaque-page-2": {
        objects: [
          {
            key: "parser-samples/orphan-a.json",
            uploaded: new Date("2026-08-10T01:00:00.000Z"),
          },
          {
            key: "parser-samples/orphan-b.json",
            uploaded: new Date("2026-08-10T01:30:00.000Z"),
          },
        ],
        truncated: false,
      },
    });

    await expect(
      deleteExpiredParserSampleObjects(
        bucket,
        new Date("2026-08-10T02:00:00.000Z"),
      ),
    ).resolves.toBe(2);

    expect(list).toHaveBeenNthCalledWith(1, {
      prefix: "parser-samples/",
      limit: 1_000,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      prefix: "parser-samples/",
      limit: 1_000,
      cursor: "opaque-page-2",
    });
    expect(deleteObjects).toHaveBeenCalledOnce();
    expect(deleteObjects).toHaveBeenCalledWith([
      "parser-samples/orphan-a.json",
      "parser-samples/orphan-b.json",
    ]);
  });
});
