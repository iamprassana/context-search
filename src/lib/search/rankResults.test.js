import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_MIN_COSINE_SIMILARITY,
  fuseRankedCandidates,
  getMinimumCosineSimilarity,
  passesCosineSimilarityThreshold,
} from "./rankResults.ts";

const originalThreshold = process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY;

const resource = (resourceId, excerpt = `content for ${resourceId}`) => ({
  resourceId,
  title: resourceId,
  type: "code",
  excerpt,
});

afterEach(() => {
  if (originalThreshold === undefined) {
    delete process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY;
  } else {
    process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY = originalThreshold;
  }
});

describe("search relevance ranking", () => {
  test("interprets pgvector cosine distance as one minus similarity", () => {
    expect(passesCosineSimilarityThreshold(0.45, 0.55)).toBe(true);
    expect(passesCosineSimilarityThreshold(0.451, 0.55)).toBe(false);
    expect(() => passesCosineSimilarityThreshold(2.1, 0.55)).toThrow(
      "invalid cosine distance",
    );
  });

  test("uses a server-side configurable similarity floor", () => {
    delete process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY;
    expect(getMinimumCosineSimilarity()).toBe(
      DEFAULT_MIN_COSINE_SIMILARITY,
    );
    process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY = "0.7";
    expect(getMinimumCosineSimilarity()).toBe(0.7);
    process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY = "1.1";
    expect(() => getMinimumCosineSimilarity()).toThrow(
      "must be a number between 0 and 1",
    );
  });

  test("fuses keyword and semantic ranks while returning one result per resource", () => {
    const shared = resource("binary-search");
    const semantic = [shared, resource("graph-cycle")];
    const keyword = [
      { ...resource("jwt-middleware"), exactKeywordMatch: true },
      {
        ...resource("binary-search", "Exact function: binarySearch"),
        exactKeywordMatch: true,
      },
      { ...resource("jwt-middleware"), exactKeywordMatch: true },
    ];

    const results = fuseRankedCandidates(semantic, keyword, 20);

    expect(results.map(({ resourceId }) => resourceId)).toEqual([
      "binary-search",
      "jwt-middleware",
      "graph-cycle",
    ]);
    expect(results.filter(({ resourceId }) => resourceId === "jwt-middleware"))
      .toHaveLength(1);
    expect(results[0].excerpt).toBe("Exact function: binarySearch");
  });

  test("returns no matches when neither retrieval source has a candidate", () => {
    expect(fuseRankedCandidates([], [], 20)).toEqual([]);
  });

  test("reproduces expected top results across representative retrieval fixtures", () => {
    const fixtures = [
      {
        query: "binarySearch",
        expected: ["binary-search"],
        semantic: [resource("binary-search")],
        keyword: [{ ...resource("binary-search"), exactKeywordMatch: true }],
      },
      {
        query: "find code that detects a cycle in a graph",
        expected: ["graph-cycle"],
        semantic: [resource("graph-cycle")],
        keyword: [],
      },
      {
        query: "database normalization",
        expected: ["database-normalization"],
        semantic: [resource("database-normalization")],
        keyword: [resource("database-normalization")],
      },
      {
        query: "article describing rate limiting",
        expected: ["rate-limit-article"],
        semantic: [resource("rate-limit-article")],
        keyword: [],
      },
      {
        query: "SOC2 retention policy",
        expected: ["soc2-pdf"],
        semantic: [resource("soc2-pdf")],
        keyword: [],
      },
      {
        query: "blue mountain at sunset",
        expected: ["mountain-image"],
        semantic: [resource("mountain-image")],
        keyword: [],
      },
      {
        query: "unrelated query with no candidates",
        expected: [],
        semantic: [],
        keyword: [],
      },
    ];

    for (const fixture of fixtures) {
      const results = fuseRankedCandidates(
        fixture.semantic,
        fixture.keyword,
        3,
      );
      const relevantAtThree = results.filter(({ resourceId }) =>
        fixture.expected.includes(resourceId),
      ).length;
      const precisionAtThree =
        results.length === 0 ? 1 : relevantAtThree / results.length;

      expect(precisionAtThree).toBe(1);
      expect(results.map(({ resourceId }) => resourceId)).toEqual(
        fixture.expected,
      );
    }
  });
});
