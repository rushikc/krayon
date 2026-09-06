export function isElementActiveAt(
  time: { start: number; end: number },
  t: number,
): boolean {
  return t >= time.start && t < time.end;
}
