/**
 * The written briefing on a match book stage page ("Targets: 14 USPSA targets, 3 mini poppers", "Rounds: 31") and
 * the T1 / P2 labels floating over targets in a 3D drawing, both read from the phone's text recognition.
 * Pure parsing: no native code here.
 */
export type TextBox = { text: string; x: number; y: number; width: number; height: number; confidence: number };
export type Briefing = { paper: number | null; poppers: number; miniPoppers: number; plates: number; noShoots: number; rounds: number | null; bestHits: number | null; text: string };

const number = (s: string) => { const n = Number(s); return Number.isInteger(n) && n >= 0 && n <= 500 ? n : null; };
/** Reads the counts from the briefing's text lines. Missing parts stay null or 0; nothing is guessed. */
export function parseBriefing(lines: readonly string[]): Briefing | null {
  const text = lines.join('\n');
  const targetsLine = lines.find(l => /^\s*targets?\s*:/i.test(l)) ?? lines.find(l => /\b\d+\s+(USPSA|IPSC|PCSL|IDPA)?\s*targets?\b/i.test(l));
  const roundsMatch = text.match(/rounds?\s*:\s*(\d{1,3})/i), bestMatch = text.match(/best\s+(\d)\s+hits?/i);
  if (!targetsLine && !roundsMatch) return null;
  const t = targetsLine ?? '';
  const count = (re: RegExp) => { let n = 0; for (const m of t.matchAll(re)) n += number(m[1]) ?? 0; return n; };
  const paperMatch = t.match(/(\d{1,3})\s+(?:USPSA|IPSC|PCSL|IDPA|paper|cardboard)?\s*targets?\b/i);
  return {
    paper: paperMatch ? number(paperMatch[1]) : null,
    miniPoppers: count(/(\d{1,3})\s+mini[\s-]*poppers?/gi),
    poppers: count(/(\d{1,3})\s+(?!mini)(?:full[\s-]*size\s+)?poppers?/gi),
    plates: count(/(\d{1,3})\s+(?:steel\s+)?plates?/gi),
    noShoots: count(/(\d{1,3})\s+no[\s-]*shoots?/gi),
    rounds: roundsMatch ? number(roundsMatch[1]) : null,
    bestHits: bestMatch ? number(bestMatch[1]) : null,
    text,
  };
}
/** Total scoring targets the briefing lists (paper + steel), or null when it lists no paper count. */
export const briefingTargets = (b: Briefing | null) => b && b.paper !== null ? b.paper + b.poppers + b.miniPoppers + b.plates : null;
/** "14 USPSA targets, 3 mini poppers, 31 rounds" in the app's words. */
export function briefingSummary(b: Briefing): string {
  const parts = [b.paper !== null ? `${b.paper} paper` : '', b.miniPoppers ? `${b.miniPoppers} mini poppers` : '', b.poppers ? `${b.poppers} poppers` : '',
    b.plates ? `${b.plates} plates` : '', b.noShoots ? `${b.noShoots} no-shoots` : '', b.rounds !== null ? `${b.rounds} rounds` : ''].filter(Boolean);
  return parts.join(', ');
}

export type Label = { kind: 'T' | 'P' | 'S'; number: number; x: number; y: number };
/** "T10 T11", "P1P2", "T 3" → separate labels, placed across the text box from left to right. */
export function parseLabels(boxes: readonly TextBox[]): Label[] {
  const out: Label[] = [];
  for (const b of boxes) {
    const matches = [...b.text.toUpperCase().matchAll(/([TPS])\s?(\d{1,2})(?!\d)/g)];
    if (!matches.length || matches.map(m => m[0]).join('').replace(/\s/g, '').length < b.text.replace(/[\s,]/g, '').length * 0.6) continue;
    matches.forEach((m, i) => {
      const n = Number(m[2]);
      if (n >= 1 && n <= 60) out.push({ kind: m[1] as Label['kind'], number: n, x: b.x + b.width * (i + 0.5) / matches.length, y: b.y + b.height / 2 });
    });
  }
  return out;
}
/**
 * Matches labels to target faces: each label goes to the nearest unclaimed face whose top is below the label or close
 * to it, within `reach` (the same units as the points). Closest pairs first.
 */
export function assignLabels<T extends { x: number; y: number }>(labels: readonly Label[], faces: readonly T[], reach: number): Map<number, Label> {
  const pairs: { f: number; l: number; d: number }[] = [];
  faces.forEach((f, fi) => labels.forEach((l, li) => {
    const d = Math.hypot(f.x - l.x, (f.y - l.y) * (f.y < l.y - reach * 0.3 ? 3 : 1));
    if (d <= reach) pairs.push({ f: fi, l: li, d });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const result = new Map<number, Label>(), used = new Set<number>();
  for (const p of pairs) if (!result.has(p.f) && !used.has(p.l)) { result.set(p.f, labels[p.l]); used.add(p.l); }
  return result;
}
