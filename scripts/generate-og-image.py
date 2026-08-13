#!/usr/bin/env python3
"""Regenerate public/og-image.png from the real logo + approved tagline."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "public" / "logo.png"
OUT_PATH = ROOT / "public" / "og-image.png"

WIDTH, HEIGHT = 1200, 630
BG = (26, 46, 68)  # navy
TAGLINE = "Insurance that helps you recover your insured items."


def main() -> None:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)

    logo = Image.open(LOGO_PATH).convert("RGBA")
    max_logo_w = 760
    scale = min(max_logo_w / logo.width, 320 / logo.height)
    logo = logo.resize((int(logo.width * scale), int(logo.height * scale)), Image.Resampling.LANCZOS)

    card_w = logo.width + 120
    card_h = logo.height + 80
    card_x = (WIDTH - card_w) // 2
    card_y = (HEIGHT - card_h) // 2 - 40
    draw.rounded_rectangle(
        (card_x, card_y, card_x + card_w, card_y + card_h),
        radius=28,
        fill=(255, 255, 255),
    )

    logo_x = (WIDTH - logo.width) // 2
    logo_y = card_y + (card_h - logo.height) // 2
    canvas.paste(logo, (logo_x, logo_y), logo)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 34)
    except OSError:
        font = ImageFont.load_default()

    text_bbox = draw.textbbox((0, 0), TAGLINE, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    text_x = (WIDTH - text_w) // 2
    text_y = card_y + card_h + 36
    draw.text((text_x, text_y), TAGLINE, fill=(255, 255, 255), font=font)

    canvas.save(OUT_PATH, format="PNG", optimize=True)
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
