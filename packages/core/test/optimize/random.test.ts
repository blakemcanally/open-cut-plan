import { describe, expect, it } from "vitest";
import { randomInt, seededRandom, shuffled } from "../../src/optimize/random.ts";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(Array.from({ length: 5 }, seededRandom(43))).not.toEqual(first);
  });

  it("gives values in [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffles into a permutation and picks integers below the bound", () => {
    const random = seededRandom(1);
    expect(shuffled(random, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    for (let i = 0; i < 100; i++) expect(randomInt(random, 3)).toBeLessThan(3);
  });
});
