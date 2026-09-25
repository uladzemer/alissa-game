# Приключения Алисы — заметки для Claude

Детский браузерный платформер (Phaser 4 + Vite + TypeScript), возраст 7+. Владелец не разработчик, общается по-русски; вкусовые решения принимает сам — спрашивать квизом.

- Концепция: `docs/CONCEPT.md`. План и чек-лист: `plans/v1.md`. Промпты картинок и музыки: `docs/art-and-audio-prompts.md`.
- Игра: https://uladzemer.github.io/alissa-game/ — выкладывается сама GitHub Actions при пуше в `main` (`.github/workflows/pages.yml`).
- Запуск: `npm run dev`; проверка типов и сборка: `npm run build`.

## Устройство
- `src/game/levels.ts` — уровни как текстовые карты через `MapBuilder` (легенда в шапке файла). Новый уровень = новая функция + строка в `LEVELS`.
- `src/scenes/Level.ts` — всё на уровне: коллизии (слитые прямоугольники тайлов), платформы, пикапы, флажки, вода, босс.
- `src/game/player.ts` (Алиса), `src/game/enemies.ts` (враги и колдунья), `src/scenes/Hud.ts` (HUD + сенсорные кнопки), `src/scenes/Menus.ts` (загрузка, титул, история, карта, финал).
- `src/game/sfx.ts` — звуки и музыка синтезом WebAudio (временная, пока нет настоящих треков).
- Масштаб `Scale.EXPAND`: высота всегда 720, ширина растёт на длинных телефонах — позиции справа считать от `viewW(scene)`, не от 1280.
- Враги не погибают: «добреют» и улетают (правило владельца, без жестокости).

## Картинки
- Генерирует Codex (встроенная генерация) — `~/.local/bin/codex-run --plan simple --sandbox workspace-write --dir .claude/worktrees/<имя>` в одноразовом worktree (`git worktree add --detach .claude/worktrees/<имя> HEAD`, заранее создать `art/incoming`). В промпт обязательно: картинка сохраняется в `$env:CODEX_HOME\generated_images\...` (аккаунты ротируются, это НЕ всегда `~/.codex`) — скопировать в нужный путь.
- Исходники листов — `art/source/*.png`; `python art/build_assets.py` режет их в `public/assets/` (персонажи: первый кадр листа = 200 px, фоны — JPEG с бесшовной склейкой). Недостающие картинки игра рисует заглушками.
- `codex-run` на Windows не в PATH — звать полным путём `~/.local/bin/codex-run`.

## Проверка
- Playwright: `npm run dev` (порт 5199), десктоп 1280×720 и телефон 844×390 с `hasTouch`. Бот `tests/bot.js` (подключать `page.addScriptTag({url:'/tests/bot.js'})`, `window.__bot.start()`) проходит уровень 1 целиком; на остальных он глупый — сложные места проверять вручную через `L.player.teleport(x, y)`.
- `window.__game` и `window.__touch` открыты для автотестов.
- Быстрые нажатия клавиш ловятся через защёлку в `Keyboard` (`controls.ts`): у Phaser `onUp` сбрасывает `_justDown`.
