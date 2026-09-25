export interface SaveData {
  unlocked: number; // how many levels are open (1..5)
  crystals: boolean[];
  stars: number;
  bonusHearts: number; // extra max hearts earned for every 100 stars (capped by PLAYER.heartCap)
  seenStory: boolean;
  finished: boolean;
  muted: boolean;
}

const KEY = 'alissa-game-save-v1';

const fresh = (): SaveData => ({
  unlocked: 1,
  crystals: [false, false, false, false, false],
  stars: 0,
  bonusHearts: 0,
  seenStory: false,
  finished: false,
  muted: false,
});

let cache: SaveData | null = null;

export function load(): SaveData {
  if (cache) return cache;
  cache = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cache = { ...cache, ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage: play without saving */
  }
  return cache!;
}

export function save(patch: Partial<SaveData> = {}): SaveData {
  const data = Object.assign(load(), patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

export function reset(): SaveData {
  cache = fresh();
  return save();
}
