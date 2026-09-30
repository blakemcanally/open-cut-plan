import type { PlanSheet, Project, Stock } from "../format/schema.ts";
import { uniqueId } from "../format/ids.ts";
import { compareScores, evaluate, type Evaluated, type Score } from "./evaluate.ts";
import { projectGoal, type OptimizerGoal } from "./goal-setting.ts";
import { createTradeOffs, type TradeOffs } from "./goal.ts";
import { guillotinePack, SPLIT_RULES, type SplitRule } from "./guillotine.ts";
import type { Packing, RotationPolicy } from "./pack.ts";
import { buildProblem, type Copy, type MaterialProblem, type Problem, type UnplacedCopy } from "./problem.ts";
import { randomInt, seededRandom, shuffled, type Random } from "./random.ts";
import { stripPack } from "./strip.ts";

export interface OptimizeOptions {
  /** Defaults to `settings.optimizer.timeLimitMs`. */
  timeLimitMs?: number;
  /** Defaults to `settings.optimizer.seed`, else 1. */
  seed?: number;
  /** Candidates per material. When set, the time limit is ignored and the result depends only on the seed. */
  iterations?: number;
  /** Milliseconds clock; defaults to `Date.now`. */
  now?: () => number;
  /** A previous result for the same project: the search continues from its plans ("Keep searching"). */
  start?: OptimizeResult;
  /** Defaults to `settings.optimizer.goal`, with `cost` for a goal that this app does not know. */
  goal?: OptimizerGoal;
  /** Defaults to `settings.optimizer.extraCostPercent`. Ignored for the goal `cost`. */
  extraCostPercent?: number;
}

export interface MaterialResult {
  material: string;
  score: Score;
  /** The lowest cost of the plans with the fewest unplaced copies that the search found. */
  cheapestCost: number;
}

export interface OptimizeResult {
  /** Pinned sheets unchanged, then the new sheets for each material. */
  sheets: PlanSheet[];
  unplaced: UnplacedCopy[];
  materials: MaterialResult[];
  /** Candidates evaluated so far, over all materials. */
  iterations: number;
}

export interface Search {
  /** Runs candidates for about `budgetMs`; returns true when the search is finished. */
  step(budgetMs: number): boolean;
  result(): OptimizeResult;
}

type Constructor = "strip" | SplitRule;

const CONSTRUCTORS: readonly Constructor[] = ["strip", ...SPLIT_RULES];

interface Candidate {
  order: Copy[];
  constructor: Constructor;
  stockOrder: Stock[];
  rotation: RotationPolicy;
}

interface MaterialSearch {
  problem: MaterialProblem;
  base: Candidate[];
  next: number;
  evaluated: number;
  /** First-stage candidates that a continued search runs again; they do not count against `iterations`. */
  rerun: number;
  best: Planned | null;
  /** Null for the goal `cost`, which keeps only the best plan. */
  trade: TradeOffs<Planned> | null;
}

interface Planned {
  candidate: Candidate;
  result: Evaluated;
}

const ORDERS: readonly ((a: Copy, b: Copy) => number)[] = [
  (a, b) => b.part.length * b.part.width - a.part.length * a.part.width,
  (a, b) => Math.max(b.part.length, b.part.width) - Math.max(a.part.length, a.part.width),
  (a, b) => b.part.length - a.part.length || b.part.width - a.part.width,
  (a, b) => b.part.width - a.part.width || b.part.length - a.part.length,
];

const MAX_STOCK_ORDERS = 6;

export function createSearch(project: Project, options: OptimizeOptions = {}): Search {
  const problem = buildProblem(project);
  const settings = project.settings.optimizer;
  const timeLimit = options.timeLimitMs ?? settings.timeLimitMs;
  const seed = options.seed ?? settings.seed ?? 1;
  const now = options.now ?? Date.now;
  const perMaterial = options.iterations === undefined ? undefined : Math.max(1, options.iterations);
  const goal = options.goal ?? projectGoal(project);
  const extra = options.extraCostPercent ?? settings.extraCostPercent;
  const random = seededRandom(seed + (options.start?.iterations ?? 0));
  const tradeOffs = (cheapest?: number) => (goal === "cost" ? null : createTradeOffs<Planned>(goal, extra, cheapest));
  const searches = problem.materials.map((m): MaterialSearch => ({ problem: m, base: baseCandidates(m), next: 0, evaluated: 0, rerun: 0, best: null, trade: tradeOffs() }));
  if (options.start) seedFrom(problem, searches, options.start, tradeOffs);
  let iterations = options.start?.iterations ?? 0;
  let elapsed = 0;
  let turn = 0;

  const finished = () => {
    if (searches.length === 0) return true;
    if (searches.some((s) => s.best === null)) return false;
    if (perMaterial !== undefined) return searches.every((s) => s.evaluated >= perMaterial);
    return elapsed >= timeLimit;
  };

  const runOne = () => {
    const pending = searches.filter((s) => perMaterial === undefined || s.evaluated < perMaterial);
    const search = pending.find((s) => s.best === null) ?? pending[turn++ % pending.length];
    if (!search) return;
    const candidate = search.next < search.base.length ? search.base[search.next++]! : randomCandidate(random, search);
    const result = evaluate(problem, search.problem, pack(problem, search.problem, candidate), `${search.problem.material}:`);
    if (search.rerun > 0) search.rerun--;
    else search.evaluated++;
    iterations++;
    record(search, { candidate, result });
  };

  return {
    step(budgetMs) {
      const started = now();
      while (!finished()) {
        runOne();
        const spent = now() - started;
        if (perMaterial === undefined && elapsed + spent >= timeLimit) break;
        if (spent >= budgetMs) break;
      }
      elapsed += now() - started;
      return finished();
    },
    result() {
      while (searches.some((s) => s.best === null)) runOne();
      return assemble(problem, searches, iterations);
    },
  };
}

export function optimize(project: Project, options: OptimizeOptions = {}): OptimizeResult {
  const search = createSearch(project, options);
  while (!search.step(Number.POSITIVE_INFINITY));
  return search.result();
}

/** The project with its plan replaced by the optimized sheets. */
export function applyOptimizeResult(project: Project, result: OptimizeResult): Project {
  return { ...project, plan: { ...project.plan, sheets: result.sheets } };
}

function record(search: MaterialSearch, planned: Planned) {
  if (!search.trade) {
    if (!search.best || compareScores(planned.result.score, search.best.result.score) < 0) search.best = planned;
    return;
  }
  search.trade.add(planned.result.score, planned);
  search.best = search.trade.chosen()!.item;
}

function pack(problem: Problem, material: MaterialProblem, candidate: Candidate): Packing {
  const input = { ctx: problem.ctx, problem: material, order: candidate.order, stockOrder: candidate.stockOrder, rotation: candidate.rotation };
  return candidate.constructor === "strip" ? stripPack(input) : guillotinePack(input, candidate.constructor);
}

function stockOrders(material: MaterialProblem): Stock[][] {
  const offcuts = material.stock.filter((s) => s.kind === "offcut");
  const sheets = material.stock.filter((s) => s.kind === "sheet");
  const orders: Stock[][] = [];
  const permute = (rest: Stock[], prefix: Stock[]) => {
    if (orders.length >= MAX_STOCK_ORDERS) return;
    if (rest.length === 0) {
      orders.push([...offcuts, ...prefix]);
      return;
    }
    rest.forEach((s, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, s]));
  };
  permute(sheets, []);
  return orders;
}

function rotations(material: MaterialProblem): RotationPolicy[] {
  return material.copies.some((c) => c.orientations.length > 1) ? ["keep", "long", "short"] : ["keep"];
}

function baseCandidates(material: MaterialProblem): Candidate[] {
  const out: Candidate[] = [];
  for (const compare of ORDERS) {
    const order = [...material.copies].sort(compare);
    for (const constructor of CONSTRUCTORS) {
      for (const stockOrder of stockOrders(material)) {
        for (const rotation of rotations(material)) out.push({ order, constructor, stockOrder, rotation });
      }
    }
  }
  return out;
}

function randomCandidate(random: Random, search: MaterialSearch): Candidate {
  const material = search.problem;
  const from = search.best?.candidate ?? search.base[0]!;
  const order = [...from.order];
  if (random() < 0.3 || order.length < 2) {
    const noise = new Map(order.map((c) => [c, c.part.length * c.part.width * (0.7 + 0.6 * random())]));
    order.sort((a, b) => noise.get(b)! - noise.get(a)!);
  } else {
    const swaps = 1 + randomInt(random, 3);
    for (let n = 0; n < swaps; n++) {
      const i = randomInt(random, order.length);
      const j = randomInt(random, order.length);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }
  const stock = stockOrders(material);
  const offcuts = material.stock.filter((s) => s.kind === "offcut");
  const stockOrder = random() < 0.5 ? from.stockOrder : [...offcuts, ...shuffled(random, stock[0]!.slice(offcuts.length))];
  const rotationList = rotations(material);
  return {
    order,
    constructor: random() < 0.5 ? from.constructor : CONSTRUCTORS[randomInt(random, CONSTRUCTORS.length)]!,
    stockOrder,
    rotation: random() < 0.5 ? from.rotation : rotationList[randomInt(random, rotationList.length)]!,
  };
}

function seedFrom(problem: Problem, searches: MaterialSearch[], start: OptimizeResult, tradeOffs: (cheapest?: number) => TradeOffs<Planned> | null) {
  const pinned = new Set(problem.pinned.map((s) => s.id));
  const reasons = new Map(start.unplaced.map((u) => [`${u.part}#${u.copy}`, u.reason]));
  for (const search of searches) {
    const base = search.base[0];
    if (!base) continue;
    const stockById = new Map(search.problem.stock.map((s) => [s.id, s]));
    const left = new Map(search.problem.available);
    const copies = new Map(search.problem.copies.map((c) => [`${c.part.id}#${c.copy}`, c]));
    const order: Copy[] = [];
    const sheets: Packing["sheets"] = [];
    for (const sheet of start.sheets) {
      const stock = stockById.get(sheet.stock);
      const count = left.get(sheet.stock);
      if (pinned.has(sheet.id) || !stock || count === 0) continue;
      const placements = sheet.placements.filter((p) => {
        const copy = copies.get(`${p.part}#${p.copy}`);
        if (!copy) return false;
        order.push(copy);
        copies.delete(`${p.part}#${p.copy}`);
        return true;
      });
      if (placements.length === 0) continue;
      if (typeof count === "number") left.set(sheet.stock, count - 1);
      sheets.push({ stock, placements });
    }
    order.push(...copies.values());
    const unplaced = [...copies.values()].map((c) => ({ part: c.part.id, copy: c.copy, reason: reasons.get(`${c.part.id}#${c.copy}`) ?? ("no-stock" as const) }));
    const cheapest = start.materials.find((m) => m.material === search.problem.material)?.cheapestCost;
    search.trade = tradeOffs(cheapest);
    record(search, { candidate: { ...base, order }, result: evaluate(problem, search.problem, { sheets, unplaced }, `${search.problem.material}:`) });
    search.next = search.trade && cheapest === undefined ? 0 : search.base.length;
    search.rerun = search.base.length - search.next;
  }
}

function assemble(problem: Problem, searches: MaterialSearch[], iterations: number): OptimizeResult {
  const taken = new Set(problem.pinned.map((s) => s.id));
  const sheets: PlanSheet[] = [...problem.pinned];
  const unplaced: UnplacedCopy[] = [];
  const materials: MaterialResult[] = [];
  for (const search of searches) {
    if (!search.best) continue;
    for (const sheet of search.best.result.sheets) {
      const id = uniqueId(`s${sheets.length + 1}`, taken);
      taken.add(id);
      sheets.push({ id, stock: sheet.stock, placements: sheet.placements });
    }
    unplaced.push(...search.best.result.unplaced);
    materials.push({ material: search.problem.material, score: search.best.result.score, cheapestCost: search.trade?.cheapest ?? search.best.result.score.cost });
  }
  return { sheets, unplaced, materials, iterations };
}
