#!/usr/bin/env python3
"""Generate the PWA icon set. Pure stdlib (no Pillow): renders at 4x with a
coverage-based downsample for antialiasing, then writes PNG chunks by hand.

Run from the repo root:  python3 tools/make-icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (0x2A, 0x78, 0xD6)      # --accent, light mode
FG = (0xFF, 0xFF, 0xFF)
SS = 4                        # supersample factor

OUT = Path(__file__).resolve().parent.parent / "icons"


def rounded_rect(x0, y0, x1, y1, r):
    """Returns a predicate: is (px, py) inside this rounded rectangle?"""
    def inside(px, py):
        if px < x0 or px > x1 or py < y0 or py > y1:
            return False
        cx = min(max(px, x0 + r), x1 - r)
        cy = min(max(py, y0 + r), y1 - r)
        if px < x0 + r or px > x1 - r:
            if py < y0 + r or py > y1 - r:
                return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
        return True
    return inside


def render(size, *, full_bleed, glyph_scale):
    """Draws the icon at `size` px and returns RGBA rows."""
    n = size * SS
    corner = 0 if full_bleed else n * 0.225
    bg = rounded_rect(0, 0, n - 1, n - 1, corner)

    # Three ascending bars, matching the Summary tab glyph.
    g = n * glyph_scale
    ox, oy = (n - g) / 2, (n - g) / 2
    bar_w = g * 0.185
    gap = (g - 3 * bar_w) / 2
    heights = (0.42, 0.72, 1.0)
    radius = bar_w * 0.34
    bars = []
    for i, h in enumerate(heights):
        bx = ox + i * (bar_w + gap)
        top = oy + g * (1 - h)
        bars.append(rounded_rect(bx, top, bx + bar_w, oy + g, radius))

    # Coverage accumulation at supersample resolution, boxed down to `size`.
    acc = [[[0, 0] for _ in range(size)] for _ in range(size)]  # [bgHits, fgHits]
    for sy in range(n):
        py = sy + 0.5
        row = acc[sy // SS]
        for sx in range(n):
            px = sx + 0.5
            if not bg(px, py):
                continue
            cell = row[sx // SS]
            cell[0] += 1
            if any(bar(px, py) for bar in bars):
                cell[1] += 1

    total = SS * SS
    rows = []
    for y in range(size):
        out = bytearray()
        for x in range(size):
            bg_hits, fg_hits = acc[y][x]
            alpha = bg_hits / total
            if alpha == 0:
                out += bytes((0, 0, 0, 0))
                continue
            k = fg_hits / bg_hits          # fg share of the covered area
            colour = tuple(round(BG[i] * (1 - k) + FG[i] * k) for i in range(3))
            out += bytes((*colour, round(alpha * 255)))
        rows.append(bytes(out))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"  {path.name}  {size}x{size}  {len(png):,} bytes")


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Nutrition Tracker">
  <rect width="512" height="512" rx="115" fill="#2a78d6"/>
  <g fill="#fff">
    <rect x="140" y="256" width="58" height="116" rx="11"/>
    <rect x="227" y="171" width="58" height="201" rx="11"/>
    <rect x="314" y="140" width="58" height="232" rx="11"/>
  </g>
</svg>
"""

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    print("Generating icons...")
    for size, name, full_bleed, scale in [
        (192, "icon-192.png", False, 0.56),
        (512, "icon-512.png", False, 0.56),
        (180, "apple-touch-icon.png", True, 0.52),
        (512, "maskable-512.png", True, 0.44),
    ]:
        write_png(OUT / name, render(size, full_bleed=full_bleed, glyph_scale=scale), size)
    (OUT / "icon.svg").write_text(SVG)
    print("  icon.svg")
