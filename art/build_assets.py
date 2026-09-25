"""Cut the Codex-generated sheets in art/source/ into game images in public/assets/.

Run: python art/build_assets.py  (needs Pillow, numpy, scipy)
Missing source files are skipped: the game draws placeholders for anything absent.
"""
from pathlib import Path

import numpy as np
from PIL import Image
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


def sheet(src: str, names: list[str], ref_index=0, ref_h=CHAR_H, same_scale=True, **kw):
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    print(src)
    frames = split(Image.open(path).convert('RGBA'), len(names), **kw)
    k = ref_h / frames[ref_index].height
    for f, name in zip(frames, names):
        s = k if same_scale else ref_h / f.height
        save(f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.LANCZOS), name)


def single(src: str, name: str, h: int):
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getbbox())
    save(im.resize((round(im.width * h / im.height), h), Image.LANCZOS), name)


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
def seamless_bg(src: str, name: str, h=720, overlap=0.18):
    """Make a background tile horizontally: cross-fade its right edge into its left edge."""
    path = SRC / src
    if not path.exists():
        print(f'skip {src} (missing)')
        return
    im = Image.open(path).convert('RGB')
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    o = int(a.shape[1] * overlap)
    w = a.shape[1] - o
    out = a[:, :w].copy()
    ramp = np.linspace(0, 1, o)[None, :, None]
    # the first `o` columns fade in from the columns that follow the tile's right edge,
    # so the right edge (column w-1) flows straight into column 0 when repeated
    out[:, :o] = a[:, w:w + o] * (1 - ramp) + a[:, :o] * ramp
    save(Image.fromarray(out.clip(0, 255).astype('uint8')), name, jpg=True)


for b in ['meadow', 'forest', 'river', 'cave', 'castle']:
    seamless_bg(f'bg-{b}.png', f'bg-{b}')
opaque('title.png', 'title', (1280, 720), jpg=True)
opaque('ending.png', 'ending', (1280, 720), jpg=True)

# Home-screen icon from the idle Alice frame.
idle = OUT / 'alice-idle.png'
if idle.exists():
    a = Image.open(idle).convert('RGBA')
    icon = Image.new('RGBA', (512, 512), (255, 179, 209, 255))
    a = a.resize((round(a.width * 440 / a.height), 440), Image.LANCZOS)
    icon.paste(a, ((512 - a.width) // 2, 50), a)
    icon.save(OUT / 'icon.png')
