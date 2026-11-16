// Beat.swift :: gcdInt / Beat / Beat.parse (via 1.txt & Sheets.swift :: normalizedForNumberInput)

export function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0 ? 1 : x; // Beat.swift :: gcdInt
}

/**
 * 全角の数字・記号や各種マイナス記号を半角にそろえ、空白を除去する (Sheets.swift :: normalizedForNumberInput)
 */
export function normalizeNumberInput(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff10 && code <= 0xff19) { // Sheets.swift :: normalizedForNumberInput ('０'...'９')
      out += String.fromCodePoint(code - 0xff10 + 0x30); // Sheets.swift :: normalizedForNumberInput (ASCII '0')
    } else if (
      code === 0xff0d || // Sheets.swift :: normalizedForNumberInput ('－')
      code === 0x2212 || // Sheets.swift :: normalizedForNumberInput ('−')
      code === 0x2010 || // Sheets.swift :: normalizedForNumberInput ('‐')
      code === 0x2011 || // Sheets.swift :: normalizedForNumberInput ('‑')
      code === 0x2012 || // Sheets.swift :: normalizedForNumberInput ('‒')
      code === 0x2013 || // Sheets.swift :: normalizedForNumberInput ('–')
      code === 0x2014 || // Sheets.swift :: normalizedForNumberInput ('—')
      code === 0x30fc || // Sheets.swift :: normalizedForNumberInput ('ー')
      code === 0xff70    // Sheets.swift :: normalizedForNumberInput ('ｰ')
    ) {
      out += '-';
    } else if (code === 0xff0b) { // Sheets.swift :: normalizedForNumberInput ('＋')
      out += '+';
    } else if (code === 0xff1a) { // Sheets.swift :: normalizedForNumberInput ('：')
      out += ':';
    } else if (code === 0xff0f) { // Sheets.swift :: normalizedForNumberInput ('／')
      out += '/';
    } else if (code === 0xff0e) { // Sheets.swift :: normalizedForNumberInput ('．')
      out += '.';
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

export type BeatTriple = [number, number, number];

/**
 * Malody の beat 表記 [整数部, 分子, 分母] (= 整数部 + 分子/分母)。0拍始まり。
 */
export class Beat {
  readonly m: number;
  readonly n: number;
  readonly d: number;

  constructor(m: number, n: number, d: number) {
    this.m = Math.trunc(m);
    this.n = Math.trunc(n);
    this.d = Math.max(1, Math.trunc(d)); // Beat.swift :: Beat.init(m:n:d:)
  }

  static readonly zero = new Beat(0, 0, 1); // Beat.swift :: Beat.zero

  get numerator(): number {
    return this.m * this.d + this.n;
  }

  get value(): number {
    return this.numerator / this.d;
  }

  /**
   * 保存用の [整数部, 分子, 分母]。
   * 負の拍は「整数部にマイナスをつけ、分子は 0 以上」にする (例: -11.5拍 → [-12, 2, 4])。
   */
  get json(): BeatTriple {
    if (this.n < 0) {
      const t = Beat.ticks(this.numerator, this.d);
      return [t.m, t.n, t.d];
    }
    return [this.m, this.n, this.d];
  }

  get label(): string {
    return `${this.m}:${this.n}/${this.d}`;
  }

  static ticks(t: number, den: number): Beat {
    const dd = Math.max(1, Math.trunc(den)); // Beat.swift :: Beat.ticks(_:den:)
    const ti = Math.trunc(t);
    const q = Math.floor(ti / dd);
    return new Beat(q, ti - q * dd, dd);
  }

  static nearest(v: number, den: number): Beat {
    const dd = Math.max(1, Math.trunc(den)); // Beat.swift :: Beat.nearest(_:den:)
    return Beat.ticks(Math.round(v * dd), dd);
  }

  static fromJSON(raw: unknown): Beat | null {
    if (!Array.isArray(raw) || raw.length < 3) return null; // Beat.swift :: Beat.fromJSON(_:)
    const a0 = raw[0], a1 = raw[1], a2 = raw[2];
    if (typeof a0 !== 'number' || typeof a1 !== 'number' || typeof a2 !== 'number') return null;
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(a2)) return null;
    return new Beat(Math.trunc(a0), Math.trunc(a1), Math.trunc(a2));
  }

  /**
   * "8:0/4" / "8" 形式を解釈 (マイナスをつけられるのは整数部のみ)
   */
  static parse(s: string): Beat | null {
    const t = normalizeNumberInput(s);
    if (!t) return null;
    const parts = t.split(/[:/]/);
    if (parts.length === 0 || parts.some((p) => !/^[+-]?\d+$/.test(p))) return null;
    const nums = parts.map((p) => Number.parseInt(p, 10));
    if (nums.some((v) => !Number.isSafeInteger(v))) return null;
    if (nums.length === 1) return new Beat(nums[0], 0, 1); // Beat.swift :: Beat.parse(_:)
    if (nums.length === 3 && nums[1] >= 0 && nums[2] > 0) return new Beat(nums[0], nums[1], nums[2]); // Beat.swift :: Beat.parse(_:)
    return null;
  }

  static compare(a: Beat, b: Beat): number {
    const l = BigInt(a.numerator) * BigInt(b.d);
    const r = BigInt(b.numerator) * BigInt(a.d);
    if (l < r) return -1; // Beat.swift :: Beat.<
    if (l > r) return 1;  // Beat.swift :: Beat.<
    return 0;             // Beat.swift :: Beat.==
  }

  equals(other: Beat): boolean {
    return Beat.compare(this, other) === 0;
  }

  lessThan(other: Beat): boolean {
    return Beat.compare(this, other) < 0;
  }

  greaterThan(other: Beat): boolean {
    return Beat.compare(this, other) > 0;
  }

  private static commonDen(a: Beat, b: Beat): number | null {
    const g = gcdInt(a.d, b.d);
    const q = (a.d / g) * b.d;
    if (!Number.isSafeInteger(q) || q > 2 ** 40) return null; // Beat.swift :: commonDen / Int64 safety (1.txt)
    return q;
  }

  add(b: Beat): Beat {
    const l = Beat.commonDen(this, b);
    if (l === null) return Beat.nearest(this.value + b.value, 1_048_576); // Beat.swift :: + fallback denominator
    const num = this.numerator * (l / this.d) + b.numerator * (l / b.d);
    if (!Number.isSafeInteger(num)) return Beat.nearest(this.value + b.value, 1_048_576); // Beat.swift :: + fallback denominator
    return Beat.ticks(num, l);
  }

  sub(b: Beat): Beat {
    const l = Beat.commonDen(this, b);
    if (l === null) return Beat.nearest(this.value - b.value, 1_048_576); // Beat.swift :: - fallback denominator
    const num = this.numerator * (l / this.d) - b.numerator * (l / b.d);
    if (!Number.isSafeInteger(num)) return Beat.nearest(this.value - b.value, 1_048_576); // Beat.swift :: - fallback denominator
    return Beat.ticks(num, l);
  }
}
