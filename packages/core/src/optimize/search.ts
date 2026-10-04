import type { Part, PlanSheet, Project, Stock } from "../format/schema.ts";
import { uniqueId } from "../format/ids.ts";
import { pushToFactoryEdges, sheetFactoryEdgeMisses } from "../plan/factoryEdges.ts";
import { compareScores, evaluate, type Evaluated, type Score } from "./evaluate.ts";
import { projectGoal, type OptimizerGoal } from "./goal-setting.ts";
import { costLimit, createTradeOffs, withinLimit, type TradeOffs } from "./goal.ts";
import { guillotinePack, SPLIT_RULES, type SplitRule } from "./guillotine.ts";
import type { Packing, RotationPolicy } from "./pack.ts";
import { orderByGroup } from "./groups.ts";
import { buildProblem, copyKey, type Copy, type MaterialProblem, type Problem, type UnplacedCopy } from "./problem.ts";
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
  /** Defaults to `settings.optimizer.keepGroupsTogether`: compare the group spread after the cost. */
  keepGroupsTogether?: boolean;
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
  affinity: boolean;
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
  /**
   * The best plan when the factory edge misses do not count, from the candidates only; null when no copy asks for a
   * factory edge. The random moves start from it, so the candidates are the same as with no requests.
   */
  blind: Blind | null;
  groups: boolean;
  /** True when the groups stay together and the copies form at least two blocks (each group, and the copies with no group). */
  grouping: boolean;
  /** The pushed copy of each packing pushed so far, by `packingKey`; null when the push changes nothing. */
  pushes: Map<string, Pushed | null>;
}

interface Pushed {
  packing: Packing;
  /** The copies that get a factory edge from the push. */
  gained: number;
  result?: Evaluated;
}

interface Planned {
  candidate: Candidate;
  result: Evaluated;
}

interface Blind {
  best: Planned | null;
  trade: TradeOffs<Planned> | null;
}

const ORDERS: readonly ((a: Copy, b: Copy) => number)[] = [
  (a, b) => b.part.length * b.part.width - a.part.length * a.part.width,
  (a, b) => Math.max(b.part.length, b.part.width) - Math.max(a.part.length, a.part.width),
  (a, b) => b.part.length - a.part.length || b.part.width - a.part.width,
  (a, b) => b.part.width - a.part.width || b.part.length - a.part.length,
];

const MAX_STOCK_ORDERS = 6;
const GROUP_MOVE = 0.3;

export function createSearch(project: Project, options: OptimizeOptions = {}): Search {
  const problem = buildProblem(project);
  const settings = project.settings.optimizer;
  const timeLimit = options.timeLimitMs ?? settings.timeLimitMs;
  const seed = options.seed ?? settings.seed ?? 1;
  const now = options.now ?? Date.now;
  const perMaterial = options.iterations === undefined ? undefined : Math.max(1, options.iterations);
  const goal = options.goal ?? projectGoal(project);
  const extra = options.extraCostPercent ?? settings.extraCostPercent;
  const groups = options.keepGroupsTogether ?? settings.keepGroupsTogether;
  const random = seededRandom(seed + (options.start?.iterations ?? 0));
  const tradeOffs = (cheapest?: number) => (goal === "cost" ? null : createTradeOffs<Planned>(goal, extra, cheapest, groups));
  const searches = problem.materials.map((m): MaterialSearch => {
    const grouping = groups && blocks(m.copies).length >= 2;
    const blind = m.factoryEdgeParts.size > 0 ? { best: null, trade: tradeOffs() } : null;
    return { problem: m, base: baseCandidates(m, grouping), next: 0, evaluated: 0, rerun: 0, best: null, trade: tradeOffs(), blind, groups, grouping, pushes: new Map() };
  });
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
    const packing = pack(problem, search.problem, candidate);
    const prefix = `${search.problem.material}:`;
    const result = evaluate(problem, search.problem, packing, prefix);
    if (search.rerun > 0) search.rerun--;
    else search.evaluated++;
    iterations++;
    record(search, { candidate, result });
    if (result.score.factoryEdgeMisses === 0 || !contends(search, result.score, extra)) return;
    const whole = result.sheets.length === packing.sheets.length;
    if (whole && !canWin(search, optimistic(result.score, 0))) return;
    const pushed = pushedCopy(problem, search, packing);
    if (!pushed) return;
    if (!pushed.result) {
      if (whole && !canWin(search, optimistic(result.score, result.score.factoryEdgeMisses - pushed.gained))) return;
      pushed.result = evaluate(problem, search.problem, pushed.packing, prefix);
    }
    record(search, { candidate, result: pushed.result }, false);
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

/** Records a plan in the result, and the plan of a candidate also in the blind best. */
function record(search: MaterialSearch, planned: Planned, candidate = true) {
  keep(search, planned, false, search.groups);
  if (search.blind && candidate) keep(search.blind, planned, true, search.groups);
}

function keep(target: Blind, planned: Planned, blind: boolean, groups: boolean) {
  const scoreOf = (p: Planned): Score => (blind ? { ...p.result.score, factoryEdgeMisses: 0 } : p.result.score);
  if (!target.trade) {
    if (!target.best || compareScores(scoreOf(planned), scoreOf(target.best), groups) < 0) target.best = planned;
    return;
  }
  target.trade.add(scoreOf(planned), planned);
  target.best = target.trade.chosen()!.item;
}

/** False when the unplaced copies or the cost of a plan keep it out of the result, so that a pushed copy of it cannot win. */
function contends(search: MaterialSearch, score: Score, extra: number): boolean {
  const best = search.best!.result.score;
  if (score.unplaced !== best.unplaced) return score.unplaced < best.unplaced;
  return withinLimit(score.cost, search.trade ? costLimit(search.trade.cheapest, extra) : best.cost);
}

/**
 * The best score that a pushed copy of a plan with this score can have: the same unplaced copies, cost, and group
 * spread when no sheet is dropped, the given misses, and offcuts and cuts that no plan beats.
 */
function optimistic(score: Score, misses: number): Score {
  return { ...score, factoryEdgeMisses: misses, largestOffcut: Number.MAX_VALUE, offcuts: [Number.MAX_VALUE], cuts: 0, cutLength: 0 };
}

/** False when a plan with this score cannot enter the result. */
function canWin(search: MaterialSearch, score: Score): boolean {
  if (search.trade) return search.trade.admits(score);
  return compareScores(score, search.best!.result.score, search.groups) < 0;
}

const MAX_PUSHES = 4096;

function packingKey(packing: Packing): string {
  const sheets = packing.sheets.map((sheet) => `${sheet.stock.id}:${sheet.placements.map((p) => `${p.part}#${p.copy}@${p.x},${p.y}${p.rotated ? "r" : ""}`).join(";")}`);
  return `${sheets.join("|")}/${packing.unplaced.map((u) => `${u.part}#${u.copy}:${u.reason}`).join(";")}`;
}

/** The pushed copy of the packing, from the earlier push of the same packing when there is one. */
function pushedCopy(problem: Problem, search: MaterialSearch, packing: Packing): Pushed | null {
  const key = packingKey(packing);
  const known = search.pushes.get(key);
  if (known !== undefined) return known;
  if (search.pushes.size >= MAX_PUSHES) search.pushes.clear();
  const pushed = pushPacking(problem, search.problem, packing);
  search.pushes.set(key, pushed);
  return pushed;
}

/** The packing with the pieces of each sheet pushed against the factory edges, and the copies that gain a factory edge; null when no sheet changes. */
function pushPacking(problem: Problem, material: MaterialProblem, packing: Packing): Pushed | null {
  const requested = (part: Part) => material.factoryEdgeParts.has(part.id);
  let gained = 0;
  const sheets = packing.sheets.map((sheet, i) => {
    const plan = { id: `${i}`, stock: sheet.stock.id, placements: sheet.placements };
    const pushed = pushToFactoryEdges(problem.ctx, plan, requested);
    if (!pushed) return sheet;
    gained += sheetFactoryEdgeMisses(problem.ctx, plan, requested) - pushed.misses;
    return { ...sheet, placements: pushed.placements };
  });
  return gained > 0 ? { packing: { ...packing, sheets }, gained } : null;
}

function pack(problem: Problem, material: MaterialProblem, candidate: Candidate): Packing {
  const input = { ctx: problem.ctx, problem: material, order: candidate.order, stockOrder: candidate.stockOrder, rotation: candidate.rotation, affinity: candidate.affinity };
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

function baseCandidates(material: MaterialProblem, grouping: boolean): Candidate[] {
  const out: Candidate[] = [];
  const add = (order: Copy[], affinity: boolean) => {
    for (const constructor of CONSTRUCTORS) {
      for (const stockOrder of stockOrders(material)) {
        for (const rotation of rotations(material)) out.push({ order, constructor, stockOrder, rotation, affinity });
      }
    }
  };
  for (const compare of ORDERS) add([...material.copies].sort(compare), false);
  if (grouping) add(groupOrder(material.copies), true);
  return out;
}

/** The copies of each group in a run, in the order that the groups first occur; the copies with no group are one run. */
function blocks(order: readonly Copy[]): Copy[][] {
  const runs = new Map<string | null, Copy[]>();
  for (const copy of order) {
    const run = runs.get(copy.group);
    if (run) run.push(copy);
    else runs.set(copy.group, [copy]);
  }
  return [...runs.values()];
}

/** The groups in runs, the largest total area first, and the copies with no group last; each run by area. */
function groupOrder(copies: readonly Copy[]): Copy[] {
  const area = (copy: Copy) => copy.part.length * copy.part.width;
  const total = (run: Copy[]) => run.reduce((sum, copy) => sum + area(copy), 0);
  const runs = blocks(copies);
  const grouped = runs.filter((run) => run[0]!.group !== null).sort((a, b) => total(b) - total(a));
  const loose = runs.filter((run) => run[0]!.group === null);
  return [...grouped, ...loose].flatMap((run) => [...run].sort(ORDERS[0]));
}

/** Puts the copies of each group in a run, then moves a run to the front, swaps two runs, or shuffles one run by size. */
function groupMove(random: Random, order: readonly Copy[]): Copy[] {
  const runs = blocks(order);
  const i = randomInt(random, runs.length);
  const kind = randomInt(random, 4);
  if (kind === 1) runs.unshift(...runs.splice(i, 1));
  else if (kind === 2) {
    const j = randomInt(random, runs.length);
    [runs[i], runs[j]] = [runs[j]!, runs[i]!];
  } else if (kind === 3) {
    const noise = new Map(runs[i]!.map((c) => [c, c.part.length * c.part.width * (0.7 + 0.6 * random())]));
    runs[i]!.sort((a, b) => noise.get(b)! - noise.get(a)!);
  }
  return runs.flat();
}

function randomCandidate(random: Random, search: MaterialSearch): Candidate {
  const material = search.problem;
  const from = (search.blind ? search.blind.best : search.best)?.candidate ?? search.base[0]!;
  let order = [...from.order];
  if (search.grouping && random() < GROUP_MOVE) {
    order = groupMove(random, order);
  } else if (random() < 0.3 || order.length < 2) {
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
    affinity: search.grouping && random() < 0.5 ? !from.affinity : from.affinity,
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
    if (search.blind) search.blind.trade = tradeOffs(cheapest);
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
    const groups = search.problem.groups;
    const groupsOf = (sheet: PlanSheet) => new Set(sheet.placements.flatMap((p) => groups.get(copyKey(p.part, p.copy)) ?? []));
    for (const sheet of search.groups ? orderByGroup(search.best.result.sheets, groupsOf) : search.best.result.sheets) {
      const id = uniqueId(`s${sheets.length + 1}`, taken);
      taken.add(id);
      sheets.push({ id, stock: sheet.stock, placements: sheet.placements });
    }
    unplaced.push(...search.best.result.unplaced);
    materials.push({ material: search.problem.material, score: search.best.result.score, cheapestCost: search.trade?.cheapest ?? search.best.result.score.cost });
  }
  return { sheets, unplaced, materials, iterations };
}
