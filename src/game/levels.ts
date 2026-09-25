/**
 * Levels are text maps built with a small helper so they are easy to read and change.
 *
 * Map legend (one character = one 64px tile):
 *   #  ground            =  wooden one-way platform   O  tree crown (one-way)   T  tree trunk (climb)
 *   |  vine (climb)     ~  water (back to flag)      ^  spikes (hurt)          L  lily pad (one-way)
 *   R  raft (moves →)   M  platform (moves ↕)        F  falling log            *  star
 *   s  strawberry       K  crystal (level goal)      P  checkpoint flag        @  start
 *   D  tower door (castle finale)
 *   Enemies: h hedgehog, m mushroom, o owl, b bat, f frog, x fish, d dog, W witch (boss, arena around her)
 */
export type World = 'meadow' | 'forest' | 'river' | 'cave' | 'castle';

export interface LevelDef {
  index: number;
  world: World;
  name: string;
  goal: string;
  ground: 'grass' | 'rock' | 'stone';
  map: string[];
}

class MapBuilder {
  rows: string[][];

  constructor(public w: number, public h: number) {
    this.rows = Array.from({ length: h }, () => Array(w).fill(' '));
  }

  set(x: number, y: number, ch: string) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.rows[y][x] = ch;
    return this;
  }

  /** Solid ground from column x1 to x2 (inclusive), top surface at row `top`, down to the bottom. */
  ground(x1: number, x2: number, top: number) {
    for (let x = x1; x <= x2; x++) for (let y = top; y < this.h; y++) this.set(x, y, '#');
    return this;
  }

  fill(x1: number, x2: number, y1: number, y2: number, ch: string) {
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) this.set(x, y, ch);
    return this;
  }

  row(x1: number, x2: number, y: number, ch: string) {
    return this.fill(x1, x2, y, y, ch);
  }

  /** Tree: crown (3 wide, one-way) at row `crown`, trunk from below it down to row `bottom`. */
  tree(x: number, crown: number, bottom: number) {
    for (let y = crown + 1; y <= bottom; y++) this.set(x, y, 'T');
    return this.row(x - 1, x + 1, crown, 'O');
  }

  vine(x: number, y1: number, y2: number) {
    return this.fill(x, x, y1, y2, '|');
  }

  water(x1: number, x2: number, top: number) {
    return this.fill(x1, x2, top, this.h - 1, '~');
  }

  stars(x1: number, x2: number, y: number) {
    return this.row(x1, x2, y, '*');
  }

  build() {
    return this.rows.map((r) => r.join(''));
  }
}

function meadow(): string[] {
  const m = new MapBuilder(142, 12);
  m.ground(0, 24, 10).set(6, 9, '@').stars(6, 10, 8).set(14, 9, 'h').set(20, 9, 'm');
  m.ground(27, 55, 10).row(30, 33, 7, '=').stars(30, 33, 6).set(36, 9, 'P');
  m.ground(40, 44, 8).stars(40, 44, 6).set(48, 9, 'm').set(52, 9, 'h').set(43, 7, 's');
  m.ground(58, 90, 10).ground(62, 63, 9).ground(64, 65, 8).row(70, 73, 6, '=').stars(70, 73, 5);
  m.set(75, 9, 'h').set(81, 9, 'h').set(86, 9, 'm').set(72, 5, 's');
  m.ground(93, 99, 10).set(94, 9, 'P').stars(99, 102, 6);
  m.ground(102, 141, 10).ground(106, 110, 8).stars(106, 110, 7).set(113, 9, 'm').set(119, 9, 'm').set(125, 9, 'h');
  m.row(116, 118, 6, '=').stars(116, 118, 5).set(130, 9, 'h');
  m.set(137, 9, 'K');
  return m.build();
}

function forest(): string[] {
  const m = new MapBuilder(150, 16);
  m.ground(0, 150, 14).set(6, 13, '@').set(10, 13, 'm').stars(3, 6, 11);
  m.tree(12, 9, 13).stars(11, 13, 8);
  m.row(16, 34, 13, '^');
  m.tree(18, 7, 13).tree(24, 5, 13).tree(30, 7, 13).tree(36, 9, 13);
  m.stars(17, 19, 6).stars(23, 25, 3).stars(29, 31, 6).set(24, 4, 's').set(27, 2, 'o');
  m.set(40, 13, 'P').set(45, 13, 'h').set(50, 13, 'm');
  m.row(54, 59, 10, '=').stars(54, 59, 9).row(61, 72, 5, '=').vine(63, 6, 13).stars(65, 71, 4).set(70, 2, 'o');
  // pit with trees to hop across
  m.set(72, 13, 'P').fill(75, 87, 14, 15, ' ').tree(77, 12, 15).tree(82, 10, 15).tree(87, 12, 15).stars(81, 83, 9);
  m.set(91, 13, 'P').set(96, 4, 'o').set(100, 13, 'h').set(106, 4, 'o').set(110, 13, 'h').set(104, 13, 'm');
  m.row(113, 127, 13, '^').tree(115, 9, 13).tree(121, 6, 13).tree(127, 9, 13).set(121, 5, 's').stars(114, 116, 8);
  m.set(131, 13, 'P').set(134, 13, 'm');
  m.tree(140, 6, 13).set(140, 5, 'K').stars(140, 140, 10).stars(140, 140, 8);
  return m.build();
}

function river(): string[] {
  const m = new MapBuilder(162, 12);
  m.water(0, 161, 10);
  m.ground(0, 15, 9).set(6, 8, '@').stars(6, 10, 7);
  m.set(18, 9, 'L').set(21, 9, 'L').set(24, 9, 'L').set(21, 8, 'f').stars(18, 24, 6);
  m.ground(27, 38, 9).set(29, 8, 'P').set(34, 8, 'h').row(31, 33, 6, '=').set(32, 5, 's');
  m.set(40, 9, 'R').set(47, 9, 'R').set(44, 11, 'x').set(51, 11, 'x').stars(41, 52, 6);
  m.ground(55, 70, 9).set(57, 8, 'P').ground(60, 62, 8).ground(63, 65, 7).stars(63, 65, 5).set(68, 8, 'm').set(64, 6, 's');
  m.row(72, 81, 9, 'F').set(76, 11, 'x').stars(72, 81, 7);
  m.ground(83, 96, 9).set(85, 8, 'P').set(91, 8, 'f').row(88, 90, 6, '=').row(92, 94, 4, '=').stars(92, 94, 3);
  m.set(99, 9, 'L').set(102, 9, 'L').set(105, 9, 'R').set(113, 9, 'L').set(116, 9, 'L').set(119, 9, 'L');
  m.set(108, 11, 'x').set(115, 11, 'x').set(116, 8, 'f').stars(99, 119, 6);
  m.ground(122, 161, 9).set(124, 8, 'P').set(130, 8, 'h').set(137, 8, 'f').set(143, 8, 'm').row(146, 149, 6, '=').stars(146, 149, 5);
  m.set(156, 8, 'K');
  return m.build();
}

function cave(): string[] {
  const m = new MapBuilder(152, 12);
  m.ground(0, 20, 10).set(6, 9, '@').set(12, 5, 'b').stars(6, 10, 8);
  m.set(23, 8, 'M').set(27, 7, 'M').stars(23, 27, 4);
  m.ground(31, 50, 10).set(33, 9, 'P').row(40, 41, 9, '^').set(45, 4, 'b').set(48, 9, 'm').stars(39, 42, 6);
  m.ground(51, 65, 10).row(52, 63, 9, '^').row(52, 54, 8, '=').row(56, 58, 5, '=').row(60, 62, 3, '=').stars(60, 62, 2).set(57, 4, 's');
  m.ground(66, 90, 10).set(68, 9, 'P').set(75, 9, 'h').set(80, 4, 'b').set(86, 5, 'b').stars(77, 84, 7);
  m.set(93, 8, 'M').set(97, 6, 'M').set(101, 8, 'M').stars(96, 98, 3);
  m.ground(105, 151, 10).set(107, 9, 'P').set(112, 9, 'm').set(118, 9, 'h').set(122, 4, 'b').set(128, 5, 'b');
  m.row(131, 132, 9, '^').row(134, 137, 7, '=').stars(134, 137, 6).set(135, 6, 's').set(140, 9, 'm');
  m.set(146, 9, 'K');
  return m.build();
}

function castle(): string[] {
  const m = new MapBuilder(131, 12);
  m.ground(0, 18, 10).set(6, 9, '@').set(15, 9, 'd').stars(6, 10, 8);
  m.ground(19, 30, 10).row(21, 28, 9, '^').row(22, 23, 7, '=').row(26, 27, 6, 'F').stars(22, 27, 4);
  m.ground(31, 60, 10).set(33, 9, 'P').set(42, 9, 'd').set(47, 5, 'b').set(52, 9, 'd').ground(55, 57, 8).stars(55, 57, 6).set(56, 7, 's');
  m.set(63, 8, 'M').set(68, 7, 'M').stars(63, 68, 4);
  m.ground(73, 107, 10).set(75, 9, 'P').set(82, 9, 'd').set(88, 4, 'b').row(90, 91, 9, '^').set(95, 9, 'd').set(100, 9, 's').set(104, 9, 'P');
  // boss arena: 20 columns, witch in the middle, tower door at the right end
  m.ground(108, 130, 10).row(112, 114, 7, '=').row(123, 125, 7, '=').set(120, 3, 'W').set(128, 9, 'D');
  return m.build();
}

export const LEVELS: LevelDef[] = [
  { index: 0, world: 'meadow', name: 'Солнечная опушка', goal: 'Найди первый волшебный ключик!', ground: 'grass', map: meadow() },
  { index: 1, world: 'forest', name: 'Сумрачный лес', goal: 'Лазай по деревьям, ключик на макушке!', ground: 'grass', map: forest() },
  { index: 2, world: 'river', name: 'Речка и переправы', goal: 'Не упади в воду!', ground: 'grass', map: river() },
  { index: 3, world: 'cave', name: 'Пещера светлячков', goal: 'Берегись летучих мышей!', ground: 'rock', map: cave() },
  { index: 4, world: 'castle', name: 'Замок колдуньи', goal: 'Расколдуй колдунью и спаси принца!', ground: 'stone', map: castle() },
];
