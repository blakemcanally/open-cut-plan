import { snapLength } from "./precision.ts";
import { convertLength, type Units } from "./units.ts";

const UNICODE_FRACTIONS: Readonly<Record<string, string>> = {
  "½": " 1/2",
  "¼": " 1/4",
  "¾": " 3/4",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

const MM_PER: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000 };

const METRIC = /^(\d+(?:[.,]\d+)*)\s*(mm|cm|m)$/;
const METRIC_NUMBER = /^\d+(?:[.,]\d+)?$/;
const FEET = /^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*-?\s*(.*)$/;
const INCH_MARK = /\s*(?:"|inches|inch|in)$/;
const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const FRACTION = /^(?:(\d+)(?:\s+|-))?(\d+)\/(\d+)$/;

export interface NumberOptions {
  decimalComma?: boolean;
}

/** Null for text that is not a length, and for a length too large to be a finite number. */
export function parseLength(text: string, units: Units, options: NumberOptions = {}): number | null {
  const value = finite(lengthOf(text.trim().replace(/^~\s*/, ""), units, options));
  return value === null ? null : snapLength(value, units);
}

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function lengthOf(text: string, units: Units, options: NumberOptions): number | null {
  let s = text
    .trim()
    .toLowerCase()
    .replace(/[\u2033\u201C\u201D]/g, '"')
    .replace(/[\u2032\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-");
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) s = s.replaceAll(glyph, ascii);
  s = s.replace(/\s+/g, " ").trim();
  if (s === "") return null;

  const metric = METRIC.exec(s);
  if (metric) {
    const number = options.decimalComma
      ? parsePlainNumber(metric[1]!, options)
      : METRIC_NUMBER.test(metric[1]!)
        ? Number(metric[1]!.replace(",", "."))
        : null;
    return number === null ? null : convertLength(number * MM_PER[metric[2]!]!, "mm", units);
  }

  const feet = FEET.exec(s);
  if (feet) {
    const rest = feet[2]!.replace(INCH_MARK, "");
    const inches = rest === "" ? 0 : parseInches(rest);
    return inches === null ? null : convertLength(Number(feet[1]) * 12 + inches, "in", units);
  }

  if (INCH_MARK.test(s) || FRACTION.test(s)) {
    const inches = parseInches(s.replace(INCH_MARK, ""));
    return inches === null ? null : convertLength(inches, "in", units);
  }

  return parsePlainNumber(s, options);
}

function parseInches(text: string): number | null {
  const s = text.trim();
  if (DECIMAL.test(s)) return Number(s);
  const fraction = FRACTION.exec(s);
  if (!fraction) return null;
  const denominator = Number(fraction[3]);
  if (denominator === 0) return null;
  return Number(fraction[1] ?? 0) + Number(fraction[2]) / denominator;
}

/**
 * By default a comma followed by exactly three digits is a thousands separator ("2,440"); otherwise it is a decimal comma ("764,5").
 * With `decimalComma`, dots separate thousands ("2.440", "1.234,5") and a comma is always the decimal mark ("2,440" is 2.44).
 * A number too large to be finite gives null.
 */
export function parsePlainNumber(text: string, options: NumberOptions = {}): number | null {
  return finite(plainNumberOf(text, options));
}

function plainNumberOf(text: string, options: NumberOptions): number | null {
  const s = text.trim();
  if (options.decimalComma && /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return Number(s.replaceAll(".", "").replace(",", "."));
  if (DECIMAL.test(s)) return Number(s);
  if (!options.decimalComma && /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return Number(s.replaceAll(",", ""));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  return null;
}
