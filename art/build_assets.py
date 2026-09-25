"""Cut the Codex-generated sheets in art/source/ into game images in public/assets/.

Run: python art/build_assets.py  (needs Pillow, numpy, scipy)
Missing source files are skipped: the game draws placeholders for anything absent.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'source'
OUT = ROOT.parent / 'public' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)

CHAR_H = 200  # reference height of the first frame of every character sheet (see src/game/assets.ts REF_H)
ITEM_H = 128


def split(sheet: Image.Image, count: int, min_share=0.02, alpha_floor=0):
    """Split a sheet of `count` side-by-side objects into images, left to right.
    Separate silhouettes are taken as they are (small bits go to the nearest one);
    touching ones are cut at the emptiest column near each boundary."""
    a = np.array(sheet.getchannel('A'))
    if alpha_floor:
        a = np.where(a < alpha_floor, 0, a)
        sheet = sheet.copy()
        sheet.putalpha(Image.fromarray(a.astype('uint8')))
    mask = a > 24
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    objs = ndimage.find_objects(lab)
    centre = lambda k: ((objs[k][1].start + objs[k][1].stop) / 2, (objs[k][0].start + objs[k][0].stop) / 2)
    big = sorted([k for k in range(n) if sizes[k] >= sizes.max() * 0.15], key=lambda k: objs[k][1].start)
    if len(big) == count:
        groups = {k: [k] for k in big}
        for k in range(n):
            if k in groups or sizes[k] < sizes.max() * min_share:
                continue
            cx, cy = centre(k)
            owner = min(big, key=lambda b: (centre(b)[0] - cx) ** 2 + (centre(b)[1] - cy) ** 2)
            groups[owner].append(k)
        out = []
        for k in big:
            keep = np.isin(lab, [g + 1 for g in groups[k]])
            piece = sheet.copy()
            piece.putalpha(Image.fromarray(np.where(keep, a, 0).astype('uint8')))
            out.append(piece.crop(piece.getbbox()))
        return out
    colsum = mask.sum(0)
    q = sheet.width // count
    win = q // 4
    cuts = [0] + [int(np.argmin(colsum[c - win:c + win]) + c - win) for c in range(q, sheet.width - q + 1, q)][: count - 1] + [sheet.width]
    out = []
    for i in range(count):
        part = sheet.crop((cuts[i], 0, cuts[i + 1], sheet.height))
        pa = np.array(part.getchannel('A'))
        plab, pn = ndimage.label(pa > 24)
        if pn:
            psizes = ndimage.sum(np.ones_like(plab), plab, range(1, pn + 1))
            keep = np.isin(plab, np.where(psizes >= psizes.max() * min_share)[0] + 1)
            part.putalpha(Image.fromarray(np.where(keep, pa, 0).astype('uint8')))
        out.append(part.crop(part.getbbox()))
    return out


def save(img: Image.Image, name: str, jpg=False):
    if jpg:  # opaque pictures (backgrounds) are much smaller as JPEG
        img.convert('RGB').save(OUT / f'{name}.jpg', quality=84, optimize=True, progressive=True)
    else:  # 256-colour palette keeps cartoon art crisp at a third of the size
        img.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / f'{name}.png', optimize=True)
    print(f'  {name}.{"jpg" if jpg else "png"} {img.width}x{img.height}')


def sheet(src: str, names: list[str], ref_index=0, ref_h=CHAR_H, same_scale=True, blur=0.0, **kw):
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    print(src)
    frames = split(Image.open(path).convert('RGBA'), len(names), **kw)
    k = ref_h / frames[ref_index].height
    for f, name in zip(frames, names):
        s = k if same_scale else ref_h / f.height
        out = f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.LANCZOS)
        if blur:
            pad = int(blur * 3)
            canvas = Image.new('RGBA', (out.width + pad * 2, out.height + pad), (0, 0, 0, 0))
            canvas.paste(out, (pad, pad))
            out = canvas.filter(ImageFilter.GaussianBlur(blur))
        save(out, name)


def align_on_head(names: list[str]):
    """Put animation frames on one canvas so the head (anchored at Kesha's beak) stays in the same spot."""
    frames = [Image.open(OUT / f'{n}.png').convert('RGBA') for n in names if (OUT / f'{n}.png').exists()]
    if len(frames) != len(names):
        return
    anchors = []
    for f in frames:
        a = np.asarray(f).astype(int)
        # the orange beak is small and unique (the yellow face also appears on the wings)
        beak = (a[:, :, 0] > 210) & (a[:, :, 1] > 100) & (a[:, :, 1] < 200) & (a[:, :, 2] < 90) & (a[:, :, 3] > 200)
        beak[a.shape[0] * 2 // 3:] = False  # ignore anything low (feet, seeds)
        ys, xs = np.nonzero(beak)
        if len(xs) < 20:
            return
        anchors.append((int(xs.mean()), int(ys.mean())))
    left = max(ax for ax, _ in anchors)
    top = max(ay for _, ay in anchors)
    right = max(f.width - ax for f, (ax, _) in zip(frames, anchors))
    bottom = max(f.height - ay for f, (_, ay) in zip(frames, anchors))
    for f, (ax, ay), n in zip(frames, anchors, names):
        canvas = Image.new('RGBA', (left + right, top + bottom), (0, 0, 0, 0))
        canvas.paste(f, (left - ax, top - ay), f)
        save(canvas, n)


def single(src: str, name: str, h: int):
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGBA')
    # crop to clearly visible pixels: faint shadow/noise alpha must not decide the bounds
    solid = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    box = solid.getbbox()
    if box:
        im = im.crop(box)
    save(im.resize((round(im.width * h / im.height), h), Image.LANCZOS), name)


def cover_crop(src: str, name: str, size: tuple[int, int], focus_y=0.5):
    """Scale uniformly and crop to the target aspect (never stretch): focus_y picks which band is kept."""
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGB')
    k = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - size[0]) // 2
    y = round((im.height - size[1]) * focus_y)
    save(im.crop((x, y, x + size[0], y + size[1])), name, jpg=True)


def opaque(src: str, name: str, size: tuple[int, int], jpg=False):
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGB')
    save(im.resize(size, Image.LANCZOS), name, jpg)


# Characters: one scale per sheet, the first frame is CHAR_H tall.
sheet('alice-a.png', ['alice-idle', 'alice-run1', 'alice-run2', 'alice-run3', 'alice-run4', 'alice-jump'])
# alice-b was drawn at another size: scale it so the standing "shoot" pose matches the idle height.
sheet('alice-b.png', ['alice-fall', 'alice-climb1', 'alice-climb2', 'alice-shoot', 'alice-shield', 'alice-hurt'], ref_index=3)
sheet('kesha.png', ['kesha-fly1', 'kesha-fly2', 'kesha-blow'], min_share=0.004)
align_on_head(['kesha-fly1', 'kesha-fly2', 'kesha-blow'])
sheet('witch.png', ['witch-fly', 'witch-cast', 'witch-kind'], min_share=0.004)
sheet('hedgehog.png', ['hedgehog1', 'hedgehog2'])
sheet('mushroom.png', ['mushroom1', 'mushroom2', 'mushroom-flat'])
sheet('owl.png', ['owl1', 'owl2', 'owl-dive'])
sheet('bat.png', ['bat1', 'bat2'])
sheet('frog.png', ['frog1', 'frog2'])
sheet('fish.png', ['fish1', 'fish2'], min_share=0.3)
sheet('dog.png', ['dog1', 'dog2', 'dog-sit'])
single('prince.png', 'prince', CHAR_H * 2)
single('king.png', 'king', CHAR_H * 2)

# Items: each object ITEM_H tall on its own; glow halos are cut away.
sheet('items.png', ['star', 'strawberry', 'crystal', 'heart', 'seed', 'orb'], ref_h=ITEM_H, same_scale=False, alpha_floor=110)
sheet('flags.png', ['flag-down', 'flag-up'], ref_h=CHAR_H, same_scale=True)
sheet('props.png', ['lily', 'raft', 'log', 'cloud'], ref_h=80, same_scale=False)
sheet('props2.png', ['crown', 'vine', 'spikes', 'door'], ref_h=240, same_scale=False)

# Tiles and backgrounds.
for t in ['grass', 'dirt', 'stone', 'wood', 'rock', 'trunk']:
    opaque(f'tile-{t}.png', f'tile-{t}', (128, 128))
def make_tileable(a: np.ndarray) -> np.ndarray:
    """Return a horizontally tileable version of an HxWxC array WITHOUT cross-fading.
    A cross-fade stacks two half-transparent copies of trees/towers (ghosts), so:
    if the picture already joins well (Codex drew it tileable) it is used as is;
    an opaque far background gets a wide soft blend (it is blurred anyway);
    a layer with transparency is mirrored (picture + flipped copy), which joins perfectly."""
    alpha = a[:, :, 3:4] / 255 if a.shape[2] == 4 else 1
    rgb = a[:, :, :3] * alpha
    seam = np.abs(rgb[:, 0] - rgb[:, -1]).mean()
    typical = np.abs(rgb[:, 1:] - rgb[:, :-1]).mean() + 1e-6
    if seam / typical <= 3.2:
        return a
    if a.shape[2] == 3 or a[:, :, 3].min() > 250:
        # opaque far background (sky, sun): mirroring would double the sun, so blend a wide edge instead;
        # it is blurred and far away, the blend is invisible there
        # pick the blend width whose two edge zones hold the least detail (plain sky rather than the sun)
        lum = a[:, :, :3].mean(2)
        detail = np.abs(np.diff(lum, axis=1)).mean(0)
        detail = np.concatenate([detail, detail[-1:]])
        W = a.shape[1]
        best = None
        for frac in np.arange(0.12, 0.36, 0.01):
            o = int(W * frac)
            cost = detail[:o].mean() + detail[W - o:].mean() - 0.5 * frac  # prefer wider when equal
            if best is None or cost < best[0]:
                best = (cost, o)
        o = best[1]
        w = W - o
        out = a[:, :w].copy()
        ramp = np.linspace(0, 1, o)[None, :, None]
        out[:, :o] = a[:, w:w + o] * (1 - ramp) + a[:, :o] * ramp
        return out
    return np.concatenate([a, a[:, ::-1]], axis=1)


def far_bg(src: str, name: str, h=1080, far=True, far_blur=4.5):
    """Far background: ONE picture, never repeated (repeating doubled the sun and the big castle).
    The game scales it a little wider than the screen and pans across it once over the whole level."""
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGB')
    img = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    if far:
        # far layer: a touch of blur, less saturation and a light haze so it sits behind the gameplay
        img = img.filter(ImageFilter.GaussianBlur(far_blur))
        img = ImageEnhance.Color(img).enhance(0.85)
        haze = Image.new('RGB', img.size, tuple(int(c) for c in np.asarray(img)[: h // 5].reshape(-1, 3).mean(0)))
        img = Image.blend(img, haze, 0.2)
    save(img, name, jpg=True)


def seamless_layer(src: str, name: str, h=720, blur=0.8, fade=0.0):
    """Middle parallax layer (transparent sky): tile it horizontally like the backgrounds, keep alpha."""
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGBA')
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    out = make_tileable(np.asarray(im).astype(np.float32))
    if fade:
        # fade the top of the scenery into mist: trunks and walls must not end in a hard straight cut
        rows = np.where(out[:, :, 3].mean(1) > 40)[0]
        if len(rows):
            top = rows[0]
            span = max(1, int((h - top) * fade))
            ramp = np.clip((np.arange(h) - top) / span, 0, 1) ** 1.5
            out[:, :, 3] *= ramp[:, None]
    img = Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA').filter(ImageFilter.GaussianBlur(blur))
    save(img, name)


def texture(src: str, name: str, size: int, crop=None):
    """Ground textures are kept big (hundreds of px per repeat) so pebbles, bricks and planks stay readable."""
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGB')
    if crop:
        im = im.crop(crop(im))
    k = size / im.height
    save(im.resize((round(im.width * k), size), Image.LANCZOS), name, jpg=True)


for b in ['meadow', 'forest', 'river', 'cave', 'castle']:
    far_bg(f'bg-{b}.png', f'bg-{b}')
for b in ['meadow', 'forest', 'river', 'cave', 'castle']:
    # only the forest trunks are cut off at the top of the picture: fade them into mist
    seamless_layer(f'mid-{b}.png', f'mid-{b}', blur=1.2, fade=0.45 if b == 'forest' else 0.0)

texture('tile-dirt.png', 'ground-dirt', 384)
texture('tile-stone.png', 'ground-stone', 320)
texture('tile-rock.png', 'ground-rock', 384)
texture('tile-wood.png', 'ground-wood', 256)
# grass edge: the top band of the grass tile (grass + a little soil), laid along every ground top
texture('tile-grass.png', 'ground-grass', 72, crop=lambda im: (0, 0, im.width, int(im.height * 0.34)))
# bark: a vertical strip from the middle of the trunk texture, so a 44px trunk still shows real bark
texture('tile-trunk.png', 'bark', 200, crop=lambda im: (int(im.width * 0.3), 0, int(im.width * 0.7), im.height))

sheet('decor-nature.png', ['grass1', 'grass2', 'daisies', 'flowers', 'fern', 'rock', 'shrooms', 'reeds'], ref_h=96, same_scale=False)
sheet('decor-dark.png', ['crystals1', 'crystals2', 'glowshrooms', 'stalagmite', 'torch', 'banner'], ref_h=96, same_scale=False)
sheet('butterfly.png', ['butterfly1', 'butterfly2'], ref_h=64, same_scale=True)
for b in ['meadow', 'forest', 'river', 'cave', 'castle']:
    seamless_layer(f'near-{b}.png', f'near-{b}', blur=0)
# foreground: soft focus, it passes right in front of the camera
sheet('fg-nature.png', ['fg-grass', 'fg-leaves', 'fg-fern', 'fg-bush'], ref_h=260, same_scale=False, blur=3.5)
sheet('fg-dark.png', ['fg-rock', 'fg-stalagmite', 'fg-pillar', 'fg-thorns'], ref_h=260, same_scale=False, blur=3.5)
# underwater life
sheet('fairy-fish.png', ['ffish1', 'ffish2', 'ffish3', 'ffish4', 'ffish5', 'ffish6'], ref_h=110, same_scale=False)
sheet('water-plants.png', ['wplant1', 'wplant2', 'wplant3', 'wplant4', 'wplant5', 'wplant6'], ref_h=220, same_scale=False)
seamless_layer('riverbed.png', 'riverbed', blur=0)
# painted interface
single('ui-button.png', 'ui-button', 140)
single('ui-panel.png', 'ui-panel', 420)
single('ui-ribbon.png', 'ui-ribbon', 140)
sheet('ui-round.png', ['ui-round-pink', 'ui-round-blue', 'ui-round-green', 'ui-round-lilac'], ref_h=200, same_scale=False)

# 1280x800 keeps a little extra height for 4:3 screens; the game crops it with a uniform cover scale
cover_crop('title.png', 'title', (1280, 800), focus_y=0.35)
cover_crop('ending.png', 'ending', (1280, 800), focus_y=0.3)

# Home-screen icon from the idle Alice frame.
idle = OUT / 'alice-idle.png'
if idle.exists():
    a = Image.open(idle).convert('RGBA')
    icon = Image.new('RGBA', (512, 512), (255, 179, 209, 255))
    a = a.resize((round(a.width * 440 / a.height), 440), Image.LANCZOS)
    icon.paste(a, ((512 - a.width) // 2, 50), a)
    icon.save(OUT / 'icon.png')

# Sounds: all MP3s packed into ONE json (base64). Download-manager browser extensions intercept
# *.mp3 requests and save them as files instead of letting the game play them; a .json is left alone,
# and one request is lighter for weak phones than 24.
import base64, json
SFX = ROOT / 'sfx'  # source MP3s (Kenney CC0); only the packed json and the license are published
if SFX.exists():
    pack = {p.stem: base64.b64encode(p.read_bytes()).decode('ascii') for p in sorted(SFX.glob('*.mp3'))}
    (ROOT.parent / 'public' / 'sfx.json').write_text(json.dumps(pack), encoding='ascii')
    (ROOT.parent / 'public' / 'sfx-LICENSE.txt').write_bytes((SFX / 'LICENSE-kenney-CC0.txt').read_bytes())
    print(f'sfx.json: {len(pack)} sounds')
