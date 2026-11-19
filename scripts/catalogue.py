"""Turn the IASC "Presentation 2025" catalogue PDF into site assets.

Usage:
  curl -L -o /tmp/catalogue.pdf https://wcsiasc.org/wp-content/uploads/2025/06/Presentation2025GP.pdf
  python3 scripts/catalogue.py /tmp/catalogue.pdf

Writes
  public/catalogue/pages/pNN.webp      page images, 1191x1684
  public/catalogue/pages/pNN-sm.webp   thumbnails, 240px
  src/data/catalogue.json              cleaned text of every page (for search / text version)

Needs PyMuPDF (fitz) and Pillow.
"""
import io
import json
import os
import re
import sys

import fitz
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_IMG = os.path.join(ROOT, "public", "catalogue", "pages")
OUT_JSON = os.path.join(ROOT, "src", "data", "catalogue.json")


def clean(text: str, n: int) -> str:
    lines = [l.strip() for l in text.splitlines()]
    # first line is the printed page number (sometimes glued to a big letter: "62N")
    if lines and re.match(rf"^{n}(?!\d)", lines[0]):
        lines[0] = lines[0][len(str(n)):].strip()
    lines = [l for l in lines if l]
    # drop single decorative letters (N / E / W, Y, U, S ...)
    lines = [l for l in lines if not re.fullmatch(r"[A-Z]", l)]
    out = ""
    for l in lines:
        if out.endswith("-") and not out.endswith(" -"):
            out = out[:-1] + l
        else:
            out = (out + " " + l) if out else l
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\b([A-Z]\.?) (?=[A-Z]\.? )", r"\1", out)  # "M I S S I O N" -> "MISSION"
    return out.strip()


def main(src: str) -> None:
    os.makedirs(OUT_IMG, exist_ok=True)
    doc = fitz.open(src)
    pages = []
    for i, page in enumerate(doc):
        n = i + 1
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        im.thumbnail((1200, 1700), Image.LANCZOS)
        im.save(os.path.join(OUT_IMG, f"p{n:02d}.webp"), "WEBP", quality=72, method=6)
        th = im.copy()
        th.thumbnail((240, 340), Image.LANCZOS)
        th.save(os.path.join(OUT_IMG, f"p{n:02d}-sm.webp"), "WEBP", quality=68, method=6)
        pages.append({"n": n, "text": clean(page.get_text(), n)})
    w, h = im.size
    with open(OUT_JSON, "w") as f:
        json.dump({"title": "Presentation 2025", "width": w, "height": h, "pages": pages}, f, ensure_ascii=False, indent=1)
    print(f"{len(pages)} pages -> {OUT_IMG}, {OUT_JSON}")


if __name__ == "__main__":
    main(sys.argv[1])
