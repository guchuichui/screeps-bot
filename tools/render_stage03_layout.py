"""Render the three Stage 03 maps from the offline coordinates report (Pillow)."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from screeps_stage03_layout import LABELS, grid_for, read
from screeps_home_layout import point

CELL = 16
LEFT, TOP = 64, 116
COLOR = {
    "background": "#101923", "panel": "#182633", "text": "#edf4ff", "muted": "#aabed0",
    "plain": "#233746", "wall": "#13202c", "swamp": "#485643", "road": "#8999a5",
    "constructedWall": "#10171d", "extension": "#9677df", "storage": "#f3aa54",
    "spawn": "#35b4b6", "link": "#ff7479", "tower": "#9dc4e8", "rampart": "#558979",
    "controller": "#e2c577", "source": "#6bc680", "mineral": "#a9e3ee", "add": "#ffe189",
}
PATH_COLORS = ("#78e6aa", "#7cc4ff", "#ffbc75", "#e5d4ff", "#e5d4ff", "#e5d4ff")


def font(size):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default(size)


def center(tile):
    x, y = tile
    return LEFT + x * CELL + CELL // 2, TOP + y * CELL + CELL // 2


def box(tile, inset=1):
    x, y = center(tile)
    half = CELL // 2 - inset
    return x - half, y - half, x + half, y + half


def render(report, name, filename):
    snap, layout = report["snapshot"], report[name]
    grid = grid_for(snap, layout["structures"])
    img = Image.new("RGB", (1250, 969), COLOR["background"])
    draw = ImageDraw.Draw(img)
    fonts = {size: font(size) for size in (12, 14, 16, 19, 25, 32)}
    titles = {"current": "Existing base", "A": "A / Conservative upgrade", "B": "B / RCL8 logistics core"}

    def text(pos, value, size=16, fill=COLOR["text"], anchor=None):
        draw.text(pos, value, font=fonts[size], fill=fill, anchor=anchor)

    text((LEFT, 26), f"E22S36   /   {titles[name]}", 32)
    text((LEFT, 72), f"shard3  |  base snapshot tick {snap['tick']}  |  geometry and static paths", 16, COLOR["muted"])
    for y in range(50):
        for x in range(50):
            mask = grid.mask((x, y))
            kind = "wall" if mask & 1 else "swamp" if mask & 2 else "plain"
            draw.rectangle(box((x, y), 0), fill=COLOR[kind])
    for n in range(0, 50, 5):
        x, y = center((n, n))
        text((x, TOP - 13), str(n), 12, COLOR["muted"], "mm")
        text((LEFT - 18, y), str(n), 12, COLOR["muted"], "mm")
    for tile in grid.roads:
        draw.rectangle(box(tile, 5), fill=COLOR["road"])
    for i, path in enumerate(layout["paths"].values()):
        points = [center(tile) for tile in path["tiles"]]
        if len(points) > 1:
            draw.line(points, fill=PATH_COLORS[i], width=2)
    additions = {(obj["type"], point(obj)) for obj in layout["add"]}
    link_labels = {tuple(tile): i for i, tile in enumerate(layout["linkNetwork"]["roles"].values(), 1)}
    for obj in sorted(layout["structures"], key=lambda item: item["type"] != "rampart"):
        kind, tile = obj["type"], point(obj)
        if kind == "road":
            if (kind, tile) in additions:
                draw.rectangle(box(tile, 4), outline=COLOR["add"])
            continue
        fill = COLOR.get(kind, "#8390a0")
        draw.rectangle(box(tile, 2), fill=fill, outline=COLOR["add"] if (kind, tile) in additions else None)
        if kind == "link":
            text(center(tile), str(link_labels[tile]), 12, "#182029", "mm")
    for obj in snap["sources"] + snap["minerals"]:
        tile = point(obj)
        kind = "source" if tile in LABELS else "mineral"
        draw.ellipse(box(tile, 2), fill=COLOR[kind])
    for source in snap["sources"]:
        for tile in grid.stands(point(source), frozenset()):
            draw.rectangle(box(tile, 1), outline=COLOR["source"])
    for tile in report["stations"].values():
        draw.rectangle(box(tile, 1), outline="#ffffff", width=2)
    for obj in snap["sites"]:
        draw.rectangle(box(point(obj), 1), outline="#fffaf1", width=2)
    for obj in layout["remove"]:
        x, y = center(point(obj))
        draw.line((x - 4, y - 4, x + 4, y + 4), fill="#fa94ac", width=2)
        draw.line((x + 4, y - 4, x - 4, y + 4), fill="#fa94ac", width=2)

    panel = 890
    draw.rounded_rectangle((panel, TOP, 1224, 916), radius=12, fill=COLOR["panel"])
    text((panel + 18, TOP + 18), "Map key", 25)
    row = TOP + 63
    legends = [("extension", "Extension cluster"), ("spawn", "Spawn"), ("storage", "Storage"),
               ("link", "Link / numbered below"), ("source", "Source and stand outlines"), ("controller", "Controller"),
               ("road", "Road"), ("swamp", "Swamp"), ("mineral", "Mineral"), ("add", "Outline = new tile")]
    for key, title in legends:
        draw.rounded_rectangle((panel + 19, row, panel + 32, row + 13), radius=2, fill=COLOR[key])
        text((panel + 44, row - 2), title, 16)
        row += 25
    text((panel + 18, row + 5), "Modeled main routes", 19)
    row += 39
    for i, (label, path) in enumerate(layout["paths"].items()):
        draw.line((panel + 19, row + 8, panel + 35, row + 8), fill=PATH_COLORS[i], width=3)
        clean = label.replace(" → ", " to ")
        text((panel + 44, row), clean, 14)
        text((1206, row + 8), str(path["cost"]), 14, COLOR["muted"], "rm")
        row += 22
    row += 10
    text((panel + 18, row), "Link roles and coordinates", 19)
    row += 34
    for i, (role, tile) in enumerate(layout["linkNetwork"]["roles"].items(), 1):
        text((panel + 18, row), f"{i}. {role}  ({tile[0]},{tile[1]})", 14)
        row += 22
    row += 12
    text((panel + 18, row), f"Build cost: {layout['cost']:,} progress", 16)
    text((LEFT, 934), "White squares: selected Miner stands  |  Pink cross: proposed retirement  |  Paths exclude moving creeps", 14, COLOR["muted"])
    img.save(filename, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    report = read(args.report)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name in ("current", "A", "B"):
        render(report, name, args.output_dir / f"layout-{name}.png")


if __name__ == "__main__":
    main()
