from pathlib import Path
from PIL import Image, ImageDraw

base = Path(__file__).resolve().parents[1] / "app"
for filename, size in [("icon.png", 80), ("icon-large.png", 256)]:
    image = Image.new("RGB", (size, size), "#162019")
    draw = ImageDraw.Draw(image)
    scale = size / 100
    box = tuple(int(x * scale) for x in [16, 28, 65, 72])
    draw.rounded_rectangle(box, radius=int(10 * scale), outline="#afdcbf", width=max(2, int(3 * scale)))
    draw.line([(int(x * scale), int(y * scale)) for x, y in [(65, 41), (85, 31), (85, 69), (65, 59)]], fill="#afdcbf", width=max(2, int(3 * scale)), joint="curve")
    draw.line([(int(27 * scale), int(43 * scale)), (int(48 * scale), int(43 * scale))], fill="#afdcbf", width=max(2, int(3 * scale)))
    draw.line([(int(27 * scale), int(56 * scale)), (int(39 * scale), int(56 * scale))], fill="#afdcbf", width=max(2, int(3 * scale)))
    image.save(base / filename)
