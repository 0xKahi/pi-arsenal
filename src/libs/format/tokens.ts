export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000 && (count / 1000).toFixed(1) !== '10.0') return `${(count / 1000).toFixed(1)}k`;
  if (count < 999500) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}
