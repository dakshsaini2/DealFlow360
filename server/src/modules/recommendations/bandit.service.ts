import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../common/utils/prisma.js";
import { getNumericSetting } from "../../common/utils/settings.js";

/**
 * An online contextual bandit for the upsell panel, built the way Vowpal
 * Wabbit's `--cb_explore_adf` works:
 *
 *   - **action-dependent features (ADF).** Each candidate is its own example,
 *     scored by one shared weight vector, so the policy generalises across
 *     products instead of learning a separate arm per SKU. A product nobody has
 *     ever been shown still gets a sensible score from its category, its
 *     margin band and its pairing type.
 *   - **the hashing trick.** Features are strings hashed into a fixed space
 *     (`FEATURE_BITS`, VW's `-b`), so the model never has to be told in advance
 *     what the catalogue contains.
 *   - **explore, then exploit.** Epsilon-greedy: most panels are the policy's
 *     own ranking, some are a random draw. Every suggestion is logged with the
 *     probability it was shown with.
 *   - **inverse propensity scoring.** Feedback trains the regressor with
 *     importance `1/p`, which is what makes learning from a panel the policy
 *     itself chose unbiased rather than self-confirming.
 *   - **AdaGrad.** Per-feature learning rates, VW's `--adaptive`, so a rare
 *     feature moves as far on its tenth example as a common one does.
 *
 * What this deliberately is not: VW's normalized/invariant updates, its
 * softmax/cover/bagging explorers, or `--cb_type mtr`. This is the `ips`
 * reduction with an adaptive learner, which is the part that earns its keep at
 * this data volume.
 */

/** Weight-space size, VW's `-b`. 2^18 buckets collide rarely at this scale. */
const FEATURE_BITS = 18;
const FEATURE_MASK = (1 << FEATURE_BITS) - 1;

const MODEL_KEY = "upsell-cb-v1";

/**
 * Importance weights are `1/p`, so a rarely-shown action can otherwise swamp
 * the model on a single click. VW clips for the same reason.
 */
const MAX_IMPORTANCE = 20;

/** Cost of an accepted suggestion, scaled by how healthy its margin was. */
const ACCEPT_COST_BASE = -0.5;
const ACCEPT_COST_MARGIN = -0.5;
/** A dismissal is worse than being ignored, so it costs more than nothing. */
const DISMISS_COST = 0.25;
const IGNORED_COST = 0;

/** Margin at which an accepted suggestion earns the full reward. */
const HEALTHY_MARGIN_PERCENT = 25;

export type FeatureVector = Record<string, number>;

export type Context = {
  customerTier: string;
  cartLines: number;
  cartValue: number;
  orderMarginPercent: number | null;
  riskScore: number;
};

export type Action = {
  productId: string;
  categoryName: string;
  suggestionType: string;
  relationshipScore: number | null;
  promoted: boolean;
  marginPercent: number | null;
  /** Suggestion unit price over the average cart line, as a size signal. */
  priceRatio: number;
  orderMarginDeltaPercent: number | null;
  riskScoreDelta: number;
};

/* ── feature extraction ───────────────────────────── */

/** FNV-1a. Cheap, stable across restarts, and good enough for hashing. */
function hashFeature(name: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) & FEATURE_MASK;
}

/**
 * Buckets a number instead of feeding it in raw. A linear model cannot bend, so
 * "margin is in the 20-30 band" is a far more useful feature than "margin =
 * 23.4" — and it keeps one outlier from dominating the weight.
 */
function bucket(value: number | null, edges: number[]): string {
  if (value === null || !Number.isFinite(value)) return "na";

  const index = edges.findIndex((edge) => value < edge);

  return index === -1 ? `${edges.length}` : `${index}`;
}

const MARGIN_EDGES = [0, 10, 20, 30, 45];
const VALUE_EDGES = [1_000, 5_000, 25_000, 100_000];
const LINES_EDGES = [2, 4, 8];
const RISK_EDGES = [10, 25, 50];
const RATIO_EDGES = [0.1, 0.5, 1, 2];
const SCORE_EDGES = [0.3, 0.6, 0.85];

/**
 * Shared (context) features, action features, and the quadratic interactions
 * between them — VW's `-q sa`. The interactions are what make this contextual:
 * "enterprise buyers take accessories" is a term the model can only learn if
 * tier and pairing type meet in one feature.
 */
export function buildFeatures(context: Context, action: Action): FeatureVector {
  const shared = [
    `tier=${context.customerTier}`,
    `lines=${bucket(context.cartLines, LINES_EDGES)}`,
    `value=${bucket(context.cartValue, VALUE_EDGES)}`,
    `omargin=${bucket(context.orderMarginPercent, MARGIN_EDGES)}`,
    `risk=${bucket(context.riskScore, RISK_EDGES)}`,
  ];

  const specific = [
    `product=${action.productId}`,
    `category=${action.categoryName}`,
    `type=${action.suggestionType}`,
    `promo=${action.promoted ? 1 : 0}`,
    `margin=${bucket(action.marginPercent, MARGIN_EDGES)}`,
    `ratio=${bucket(action.priceRatio, RATIO_EDGES)}`,
    `pair=${bucket(action.relationshipScore, SCORE_EDGES)}`,
    `odelta=${bucket(action.orderMarginDeltaPercent, MARGIN_EDGES)}`,
    `rdelta=${action.riskScoreDelta > 0 ? "up" : "down"}`,
  ];

  const features: FeatureVector = {};
  const add = (name: string) => {
    const key = String(hashFeature(name));
    features[key] = (features[key] ?? 0) + 1;
  };

  shared.forEach((name) => add(`s^${name}`));
  specific.forEach((name) => add(`a^${name}`));

  // Interactions between the two namespaces.
  for (const s of shared) {
    for (const a of specific) {
      add(`sa^${s}^${a}`);
    }
  }

  return features;
}

/* ── the model ────────────────────────────────────── */

type Weights = Record<string, [number, number]>;

type Model = {
  weights: Map<number, { w: number; g2: number }>;
  bias: number;
  biasGrad: number;
  updates: number;
  totalCost: number;
};

let cached: Model | null = null;
/** Serialises read-modify-write so two concurrent accepts cannot clobber. */
let queue: Promise<unknown> = Promise.resolve();

async function loadModel(): Promise<Model> {
  if (cached) return cached;

  const row = await prisma.banditModel.findUnique({ where: { key: MODEL_KEY } });

  const weights = new Map<number, { w: number; g2: number }>();

  if (row) {
    for (const [key, value] of Object.entries((row.weights ?? {}) as Weights)) {
      weights.set(Number(key), { w: value[0], g2: value[1] });
    }
  }

  cached = {
    weights,
    bias: row?.bias ?? 0,
    biasGrad: row?.biasGrad ?? 0,
    updates: row?.updates ?? 0,
    totalCost: row?.totalCost ?? 0,
  };

  return cached;
}

async function persist(model: Model): Promise<void> {
  const weights: Weights = {};

  for (const [index, value] of model.weights) {
    weights[String(index)] = [value.w, value.g2];
  }

  await prisma.banditModel.upsert({
    where: { key: MODEL_KEY },
    update: {
      weights,
      bias: model.bias,
      biasGrad: model.biasGrad,
      updates: model.updates,
      totalCost: model.totalCost,
    },
    create: {
      key: MODEL_KEY,
      weights,
      bias: model.bias,
      biasGrad: model.biasGrad,
      updates: model.updates,
      totalCost: model.totalCost,
    },
  });
}

/** Predicted cost. Lower is better, so the ranking score is its negation. */
function predictCost(model: Model, features: FeatureVector): number {
  let sum = model.bias;

  for (const [key, value] of Object.entries(features)) {
    sum += (model.weights.get(Number(key))?.w ?? 0) * value;
  }

  return sum;
}

/**
 * One squared-loss step toward the observed cost — adaptive and invariant, the
 * pair VW runs by default.
 *
 * *Adaptive* is AdaGrad: each feature gets its own rate from the gradient it
 * has accumulated, so a feature seen ten times still moves while a common one
 * has settled.
 *
 * *Invariant* is the importance-aware step of Karampatziakis & Langford: with
 * IPS weights reaching `MAX_IMPORTANCE`, a plain `rate * importance` step
 * happily flies past the label and leaves the model oscillating. Solving the
 * step in closed form instead moves the prediction toward the cost by
 * `1 - exp(-importance * norm)` of the gap — a lot for a confident update,
 * never past it. That is what keeps predictions inside the range costs
 * actually take, which is what keeps the ranking meaningful.
 */
function applyUpdate(
  model: Model,
  features: FeatureVector,
  cost: number,
  importance: number,
  learningRate: number,
): void {
  const error = cost - predictCost(model, features);
  const entries = Object.entries(features);

  // AdaGrad accumulators first: the per-feature rates below come out of them.
  const biasGradient = -importance * error;
  model.biasGrad += biasGradient * biasGradient;

  const biasRate = learningRate / Math.sqrt(model.biasGrad + 1e-8);
  let norm = biasRate;

  const rates = new Map<number, number>();

  for (const [key, value] of entries) {
    const index = Number(key);
    const entry = model.weights.get(index) ?? { w: 0, g2: 0 };
    const gradient = -importance * error * value;

    entry.g2 += gradient * gradient;
    model.weights.set(index, entry);

    const rate = learningRate / Math.sqrt(entry.g2 + 1e-8);

    rates.set(index, rate);
    norm += rate * value * value;
  }

  const scale = norm > 0 ? (1 - Math.exp(-importance * norm)) / norm : 0;

  model.bias += error * scale * biasRate;

  for (const [key, value] of entries) {
    const index = Number(key);
    const entry = model.weights.get(index)!;

    entry.w += error * scale * rates.get(index)! * value;
  }

  model.updates += 1;
  model.totalCost += cost;
}

/* ── public surface ───────────────────────────────── */

export type PolicyState = {
  updates: number;
  epsilon: number;
  /** How far the ranking has moved from the heuristic to the policy, 0-1. */
  trust: number;
  averageCost: number;
};

export async function policyState(): Promise<PolicyState> {
  const [model, epsilon, warmup] = await Promise.all([
    loadModel(),
    getNumericSetting("BANDIT_EXPLORATION_EPSILON"),
    getNumericSetting("BANDIT_WARMUP_UPDATES"),
  ]);

  return {
    updates: model.updates,
    epsilon: clamp(epsilon, 0, 1),
    trust: warmup <= 0 ? 1 : clamp(model.updates / warmup, 0, 1),
    averageCost: model.updates === 0 ? 0 : model.totalCost / model.updates,
  };
}

/**
 * Policy score in (0, 1), high is good.
 *
 * Squashed rather than clipped: clipping ties every confident candidate at 1
 * and throws away the ordering that is the whole point. The logistic is
 * strictly decreasing in predicted cost, so the ranking is exactly the model's
 * ranking, on a scale the heuristic can be blended against.
 */
export async function scoreActions(
  context: Context,
  actions: Action[],
): Promise<{ features: FeatureVector; score: number }[]> {
  const model = await loadModel();

  return actions.map((action) => {
    const features = buildFeatures(context, action);

    return { features, score: 1 / (1 + Math.exp(predictCost(model, features))) };
  });
}

export type Choice<T> = {
  item: T;
  /** Marginal probability this item was shown. The `p` in `1/p`. */
  probability: number;
  explored: boolean;
};

/**
 * Epsilon-greedy over a panel of `slots`: with probability `1 - epsilon` the
 * panel is the policy's own top-k, otherwise it is a uniform random subset.
 *
 * The marginal probability of any one item appearing is therefore exact and
 * closed-form, which is what the IPS update needs:
 *
 *     p(i) = (1 - eps) * [i in greedy top-k] + eps * k / n
 *
 * The draw is seeded rather than freshly random so one quotation keeps one
 * panel while the rep works on it — a panel that reshuffled on every cart edit
 * would be both unusable and untrue to what was logged. The seed is
 * independent of the scores, so the propensities above still hold.
 */
export function exploreTopK<T>(
  ranked: { item: T; score: number }[],
  slots: number,
  epsilon: number,
  seed: string,
): Choice<T>[] {
  const n = ranked.length;
  const k = Math.min(slots, n);

  if (k === 0) return [];

  const byScore = [...ranked].sort((a, b) => b.score - a.score);

  // Everything fits on the panel, so there is nothing to explore and no
  // propensity correction to make.
  if (k === n) {
    return byScore.map((entry) => ({ item: entry.item, probability: 1, explored: false }));
  }

  const random = seededRandom(seed);
  const greedy = new Set(byScore.slice(0, k).map((entry) => entry.item));
  const exploring = random() < epsilon;
  const chosen = exploring ? sample(byScore, k, random) : byScore.slice(0, k);

  // Which suggestions appear is the random part; the order they are read in is
  // not. An explored panel is still shown best-first.
  return chosen
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({
      item: entry.item,
      probability: round6((1 - epsilon) * (greedy.has(entry.item) ? 1 : 0) + (epsilon * k) / n),
      explored: exploring && !greedy.has(entry.item),
    }));
}

/** Cost for an accepted suggestion; a healthier margin earns a bigger reward. */
export function acceptCost(marginPercent: number | null): number {
  const health =
    marginPercent === null ? 0.5 : clamp(marginPercent / HEALTHY_MARGIN_PERCENT, 0, 1);

  return round3(ACCEPT_COST_BASE + ACCEPT_COST_MARGIN * health);
}

export const DISMISS = DISMISS_COST;
export const IGNORED = IGNORED_COST;

export type Sample = {
  features: FeatureVector;
  cost: number;
  /** The propensity the decision was logged with — the `p` in `1/p`. */
  probability: number;
};

/**
 * IPS-weighted updates: each observed cost divided by the probability its
 * action was shown with. Serialised against every other update, so two
 * concurrent accepts cannot read-modify-write over each other.
 *
 * The whole batch trains in one pass and persists once. Order still matters to
 * an online learner, so this is not a shortcut around sequential updates — it
 * is the same sequence of updates, saved once at the end instead of rewriting
 * the entire weight vector after each one.
 */
export async function learnDecisions(samples: Sample[]): Promise<void> {
  if (samples.length === 0) return;

  const run = queue.then(async () => {
    const [model, learningRate] = await Promise.all([
      loadModel(),
      getNumericSetting("BANDIT_LEARNING_RATE"),
    ]);

    const rate = learningRate > 0 ? learningRate : 0.5;

    for (const sample of samples) {
      const importance = Math.min(
        MAX_IMPORTANCE,
        sample.probability > 0 ? 1 / sample.probability : 1,
      );

      applyUpdate(model, sample.features, sample.cost, importance, rate);
    }

    await persist(model);
  });

  queue = run.catch(() => undefined);

  return run;
}

/** One IPS-weighted update. */
export async function learnDecision(
  features: FeatureVector,
  cost: number,
  probability: number,
): Promise<void> {
  return learnDecisions([{ features, cost, probability }]);
}

/**
 * Trains on one logged decision and marks it learned. Returns false when the
 * row has already trained the model, so a retried request cannot count twice.
 */
export async function learnFromEvent(eventId: string, cost: number): Promise<boolean> {
  const event = await prisma.recommendationEvent.findUnique({
    where: { id: eventId },
    select: { features: true, probability: true, learnedAt: true },
  });

  if (!event || event.learnedAt || !event.features) {
    return false;
  }

  // Claim the row before training on it: the update only matches while the
  // decision is still open, so two concurrent accepts cannot both count. A
  // sample lost to a failure after this point is better than one counted twice.
  const claimed = await prisma.recommendationEvent.updateMany({
    where: { id: eventId, learnedAt: null },
    data: { cost, learnedAt: new Date() },
  });

  if (claimed.count === 0) {
    return false;
  }

  await learnDecision(
    event.features as FeatureVector,
    cost,
    event.probability === null ? 1 : Number(event.probability),
  );

  return true;
}

/**
 * Settles a batch of decisions at one cost and trains on every row this call
 * actually claimed. Returns how many that was.
 *
 * The rows are claimed with a stamp unique to this sweep, then read back by it,
 * so a row another request claimed first is simply not in the read-back and is
 * never trained on twice. `updateMany` only reports how many rows it touched,
 * not which — the stamp is what turns that count back into an identity.
 */
export async function learnFromEvents(ids: string[], cost: number): Promise<number> {
  if (ids.length === 0) return 0;

  const stamp = sweepStamp();

  await prisma.recommendationEvent.updateMany({
    where: { id: { in: ids }, learnedAt: null, features: { not: Prisma.DbNull } },
    data: { cost, learnedAt: stamp },
  });

  const claimed = await prisma.recommendationEvent.findMany({
    where: { id: { in: ids }, learnedAt: stamp },
    select: { features: true, probability: true },
  });

  const samples = claimed
    .filter((row) => row.features !== null)
    .map((row) => ({
      features: row.features as FeatureVector,
      cost,
      probability: row.probability === null ? 1 : Number(row.probability),
    }));

  await learnDecisions(samples);

  return samples.length;
}

/**
 * A stamp no other sweep in this process shares, so the read-back above can
 * only ever see rows this call claimed.
 */
let lastStamp = 0;

function sweepStamp(): Date {
  lastStamp = Math.max(Date.now(), lastStamp + 1);

  return new Date(lastStamp);
}

/** Drops the in-process copy; the next read reloads it from the database. */
export function resetCache(): void {
  cached = null;
}

/* ── helpers ──────────────────────────────────────── */

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Uniform sample without replacement — the explore branch's random panel. */
function sample<T>(pool: T[], count: number, random: () => number): T[] {
  const copy = [...pool];

  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy.slice(0, count);
}

/** mulberry32 off the seed's hash: same seed, same panel. */
function seededRandom(seed: string): () => number {
  let state = hashFeature(seed) ^ 0x9e3779b9;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
