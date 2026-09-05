const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type PageParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

/** Reads `page` / `pageSize` off a query string, clamped to sane bounds. */
export function parsePageParams(query: unknown): PageParams {
  const { page, pageSize } = (query ?? {}) as Record<string, unknown>;

  const parsedPage = Math.max(1, toInt(page, 1));
  const parsedSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, toInt(pageSize, DEFAULT_PAGE_SIZE)),
  );

  return {
    page: parsedPage,
    pageSize: parsedSize,
    skip: (parsedPage - 1) * parsedSize,
    take: parsedSize,
  };
}

export function paginated<T>(
  data: T[],
  total: number,
  { page, pageSize }: PageParams,
): Paginated<T> {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : fallback;
}
