# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools"]
# ///
"""Build public/guides/guides.json from the CNS11643 Shuowen Jiezi small-seal
font: for each character offered for carving, its outline as an SVG path on a
0-1000 grid, and a 64x64 mask of where its strokes are, for the server's
tracing check (src/carve.ts). Run once, by hand:

    uv run public/guides/build.py /path/to/ebas927.ttf

The font itself is not committed. Source and licence: LICENSE.md beside this.
"""

import json
import sys
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# Words real collectors' and viewers' seals use, and the landscape such seals
# were pressed beside. The first twelve are the generated seals' own pool.
CHARACTERS = {
    "鑑": "to appraise",
    "賞": "to enjoy",
    "藏": "to keep",
    "觀": "to look at",
    "閱": "to read through",
    "記": "to record",
    "題": "to inscribe",
    "珍": "to treasure",
    "玩": "to savour",
    "守": "to guard",
    "傳": "to hand on",
    "校": "to collate",
    "見": "to see",
    "看": "to look",
    "讀": "to read",
    "過": "to pass before",
    "眼": "the eye",
    "心": "heart, mind",
    "山": "mountain",
    "水": "water",
    "石": "stone",
    "松": "pine",
    "竹": "bamboo",
    "林": "forest",
    "雲": "cloud",
    "月": "moon",
    "清": "clear",
    "靜": "still",
    "閒": "at leisure",
    "樂": "joy",
    "壽": "long life",
    "游": "to wander",
}

GRID = 64
BOX = (60, 940)  # the glyph is fitted inside this square of the 0-1000 grid


class PolygonPen(BasePen):
    """Flattens an outline into closed polygons for rasterising."""

    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.polygons: list[list[tuple[float, float]]] = []

    def _moveTo(self, pt):
        self.polygons.append([pt])

    def _lineTo(self, pt):
        self.polygons[-1].append(pt)

    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for i in range(1, 9):
            t = i / 8
            mt = 1 - t
            self.polygons[-1].append(
                (
                    mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0],
                    mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1],
                )
            )

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        for i in range(1, 7):
            t = i / 6
            mt = 1 - t
            self.polygons[-1].append(
                (
                    mt**2 * p0[0] + 2 * mt * t * p1[0] + t**2 * p2[0],
                    mt**2 * p0[1] + 2 * mt * t * p1[1] + t**2 * p2[1],
                )
            )

    def _closePath(self):
        pass


def winding(polygons, x: float, y: float) -> int:
    w = 0
    for poly in polygons:
        for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
            if y0 <= y < y1 and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0:
                w += 1
            elif y1 <= y < y0 and (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0:
                w -= 1
    return w


def build(font_path: str) -> dict:
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    out = {}
    for ch, meaning in CHARACTERS.items():
        name = cmap.get(ord(ch))
        if name is None:
            print(f"skipping {ch}: not in the font", file=sys.stderr)
            continue
        glyph = glyphs[name]

        probe = PolygonPen(glyphs)
        glyph.draw(probe)
        xs = [x for poly in probe.polygons for x, _ in poly]
        ys = [y for poly in probe.polygons for _, y in poly]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        size = BOX[1] - BOX[0]
        scale = size / max(x1 - x0, y1 - y0)
        dx = BOX[0] + (size - (x1 - x0) * scale) / 2 - x0 * scale
        dy = BOX[0] + (size - (y1 - y0) * scale) / 2 + y1 * scale
        transform = (scale, 0, 0, -scale, dx, dy)  # font y runs up, the grid's down

        svg = SVGPathPen(glyphs, ntos=lambda n: str(round(n)))
        glyph.draw(TransformPen(svg, transform))
        flat = PolygonPen(glyphs)
        glyph.draw(TransformPen(flat, transform))

        cell = 1000 / GRID
        rows = []
        for r in range(GRID):
            bits = 0
            for c in range(GRID):
                if winding(flat.polygons, (c + 0.5) * cell, (r + 0.5) * cell) != 0:
                    bits |= 1 << c
            rows.append(f"{bits:016x}")
        out[ch] = {"meaning": meaning, "path": svg.getCommands(), "mask": rows}
    return out


if __name__ == "__main__":
    guides = build(sys.argv[1])
    target = Path(__file__).with_name("guides.json")
    target.write_text(json.dumps(guides, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {len(guides)} guides to {target}")
