# Промпты для картинок и музыки

## Картинки (генерирует Codex — делаю сам)

Общая шапка для каждого прогона (стиль, правила листов, описание Алисы):

```
STYLE: bright colorful stylized 2D cartoon game art for a children's platformer, bold clean dark outlines,
soft cel shading, saturated friendly colors, cute rounded shapes, clean readable silhouette, no text, no watermark.

SPRITE SHEET RULES: N equal panels side by side in ONE row, the same character in every panel, same scale,
feet on the same ground line, faces RIGHT in side view, generous empty space between panels,
fully TRANSPARENT background, no divider lines, no ground shadows.

ALICE: a 7-year-old girl, light blonde shoulder-length hair with a small pink hair clip, big friendly blue eyes,
rosy cheeks, pink knee-length dress with short puffy sleeves, white socks, pink-and-white sneakers,
tiny light-brown backpack.
```

Что уже нарисовано (исходники в `art/source/`): Алиса (2 листа по 6 поз), Кеша, колдунья, принц, король,
ёж, гриб, сова, летучая мышь, лягушка, рыбка, собака, предметы, флажки, плоты/кувшинки/облако,
крона/лиана/шипы/дверь, 6 текстур земли, 5 фонов, титульная и финальная картинки.

Чтобы добавить нового героя или врага: попросить меня — сгенерирую лист, нарежу `art/build_assets.py`, добавлю в игру.

## Музыка (генерируешь ты — например, в Suno или Udio)

Нужно 6 треков, инструментал без слов, зацикливаемые (loop), 1–2 минуты, формат mp3.
Готовые файлы положи в папку `public/music/` с этими именами — я подключу их вместо временной «пищалки».

1. **title.mp3** — титул и карта мира
   `Cheerful whimsical fairy-tale adventure theme for a children's video game, glockenspiel, pizzicato strings, flute, light percussion, bright and magical, 120 BPM, seamless loop, instrumental, no vocals`

2. **meadow.mp3** — Солнечная опушка
   `Happy bouncy platformer game music, sunny meadow, ukulele, xylophone, whistling melody, playful bass, 130 BPM, cute and energetic, seamless loop, instrumental, no vocals`

3. **forest.mp3** — Сумрачный лес
   `Mysterious but friendly enchanted forest at dusk, children's game music, celesta, harp arpeggios, soft woodwinds, gentle hand drums, fireflies sparkle, 105 BPM, seamless loop, instrumental, no vocals`

4. **river.mp3** — Речка и переправы
   `Playful water level music for a kids platformer, marimba, steel drums, plucky strings, bubbly synth effects, flowing and light, 115 BPM, seamless loop, instrumental, no vocals`

5. **cave.mp3** — Пещера светлячков
   `Magical crystal cave music for a children's game, echoing music box, glass harmonica, soft synth pads, light pizzicato, curious and wondrous not scary, 95 BPM, seamless loop, instrumental, no vocals`

6. **castle.mp3** — Замок колдуньи и бой
   `Exciting but kid-friendly boss battle in a witch's castle, playful harpsichord, brass stabs, timpani, pipe organ hints, cartoon villain mood, 140 BPM, seamless loop, instrumental, no vocals`

Звуки (прыжок, звёздочка, выстрел сердечком) пока синтезируются в коде — если захочешь «настоящие», скажи, дам промпты.
