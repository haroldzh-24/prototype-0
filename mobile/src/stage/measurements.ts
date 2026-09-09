/** Accept bare inches, decimal/fractional inches, or feet + inches: 66, 6 1/2, 5' 6". */
export function parseLength(text: string): number | null {
  let value = text.trim().toLowerCase().replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"');
  const sign = value.startsWith('-') ? -1 : 1;
  value = value.replace(/^[+-]/, '').trim();
  const number = (part: string): number | null => {
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)) return Number(part);
    const fraction = part.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
    if (!fraction || Number(fraction[3]) === 0) return null;
    return Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]);
  };
  const parts = value.split("'");
  if (parts.length > 2) return null;
  const feet = parts.length === 2 ? number(parts[0].trim()) : 0;
  const tail = parts[parts.length - 1].replace(/"$/, '').trim();
  const inches = tail === '' && parts.length === 2 ? 0 : number(tail);
  if (feet === null || inches === null) return null;
  const result = sign * (feet * 12 + inches);
  return Number.isFinite(result) ? result : null;
}
export function formatLength(inches: number): string {
  const rounded = Math.round(Math.abs(inches) * 1000) / 1000;
  const feet = Math.floor(rounded / 12);
  const remainder = Math.round((rounded - feet * 12) * 1000) / 1000;
  return (inches < 0 ? '-' : '') + feet + ' ft ' + remainder + ' in';
}
