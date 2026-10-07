export function pickRandomGame<T>(games: T[], random: () => number = Math.random): T | null {
  if (games.length === 0) return null;
  const index = Math.min(games.length - 1, Math.floor(random() * games.length));
  return games[index];
}

export function nextCyclingIndex(current: number, length: number, random: () => number = Math.random): number {
  if (length <= 1) return 0;
  let next = Math.floor(random() * length);
  if (next === current) {
    next = (next + 1) % length;
  }
  return next;
}
