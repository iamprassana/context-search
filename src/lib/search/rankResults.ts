export const DEFAULT_MIN_COSINE_SIMILARITY = 0.55;
const RECIPROCAL_RANK_FUSION_CONSTANT = 60;

export type RankedSearchCandidate = {
  resourceId: string;
  title: string;
  type: "url" | "note" | "code" | "file";
  excerpt: string;
};

export type SearchCandidateMatch = RankedSearchCandidate & {
  exactKeywordMatch?: boolean;
};

export function getMinimumCosineSimilarity(): number {
  const configured = process.env.CONTEXTKEEP_MIN_COSINE_SIMILARITY?.trim();
  if (!configured) return DEFAULT_MIN_COSINE_SIMILARITY;

  const threshold = Number(configured);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(
      "CONTEXTKEEP_MIN_COSINE_SIMILARITY must be a number between 0 and 1.",
    );
  }
  return threshold;
}

export function passesCosineSimilarityThreshold(
  distance: number,
  minimumSimilarity: number,
): boolean {
  if (!Number.isFinite(distance) || distance < 0 || distance > 2) {
    throw new Error("The vector search returned an invalid cosine distance.");
  }
  return 1 - distance >= minimumSimilarity;
}

export function fuseRankedCandidates(
  semanticCandidates: readonly RankedSearchCandidate[],
  keywordCandidates: readonly SearchCandidateMatch[],
  maximumResults: number,
): RankedSearchCandidate[] {
  const fused = new Map<
    string,
    {
      candidate: RankedSearchCandidate;
      score: number;
      semanticRank?: number;
      keywordRank?: number;
      exactKeywordMatch: boolean;
    }
  >();

  addRankedCandidates(fused, semanticCandidates, "semantic");
  addRankedCandidates(fused, keywordCandidates, "keyword");

  return Array.from(fused.values())
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.exactKeywordMatch) - Number(left.exactKeywordMatch) ||
        (left.semanticRank ?? Number.MAX_SAFE_INTEGER) -
          (right.semanticRank ?? Number.MAX_SAFE_INTEGER) ||
        (left.keywordRank ?? Number.MAX_SAFE_INTEGER) -
          (right.keywordRank ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, maximumResults)
    .map(({ candidate }) => candidate);
}

function addRankedCandidates(
  fused: Map<
    string,
    {
      candidate: RankedSearchCandidate;
      score: number;
      semanticRank?: number;
      keywordRank?: number;
      exactKeywordMatch: boolean;
    }
  >,
  candidates: readonly SearchCandidateMatch[],
  source: "semantic" | "keyword",
): void {
  const seen = new Set<string>();
  let rank = 0;

  for (const candidate of candidates) {
    if (seen.has(candidate.resourceId)) continue;
    seen.add(candidate.resourceId);
    rank += 1;

    const current = fused.get(candidate.resourceId);
    const exactKeywordMatch =
      source === "keyword" && candidate.exactKeywordMatch === true;
    const contribution = 1 / (RECIPROCAL_RANK_FUSION_CONSTANT + rank);
    if (!current) {
      fused.set(candidate.resourceId, {
        candidate,
        score: contribution,
        [source === "semantic" ? "semanticRank" : "keywordRank"]: rank,
        exactKeywordMatch,
      });
      continue;
    }

    current.score += contribution;
    if (source === "semantic") current.semanticRank = rank;
    else current.keywordRank = rank;
    if (exactKeywordMatch) {
      current.exactKeywordMatch = true;
      current.candidate = candidate;
    }
  }
}
