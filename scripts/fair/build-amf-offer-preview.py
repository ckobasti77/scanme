"""Rebuild only requested visuals; preserve the supplied offer and its other pages."""
from pathlib import Path
from io import BytesIO
import argparse
import pymupdf as pdf
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[2]
OFFER = Path(r"C:/My Stuff/Posao/Komandni Stab/Auto-Moto-Fest-2026/Ponuda")
SOURCE = OFFER / "AMF-2026-Ponuda-izlagacima-NACRT.pdf"
ASSETS = ROOT / "output/amf-ponuda/screens"
OUT = ROOT / "output/pdf/AMF-2026-Ponuda-izlagacima-RADNI-PREGLED.pdf"
PAPER, INK, ORANGE = map(HexColor, ["#faf7ef", "#211e19", "#d95119"])
MUTED, LINE = HexColor("#655d51"), HexColor("#ded4c3")
W, H = 1200, 675.12

pdfmetrics.registerFont(TTFont("AMFBody", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("AMFBold", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont("AMFDisplay", "C:/Windows/Fonts/ARIALNB.TTF"))


def text(c, value, x, y, size=14, font="AMFBody", color=INK):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, value)


def center(c, value, x, y, size=14, font="AMFBold", color=INK):
    text(c, value, x - pdfmetrics.stringWidth(value, font, size) / 2, y, size, font, color)


def wrap(c, value, x, y, width, size=14, leading=20, color=MUTED):
    row = ""
    for word in value.split():
        candidate = f"{row} {word}".strip()
        if pdfmetrics.stringWidth(candidate, "AMFBody", size) > width and row:
            text(c, row, x, y, size, color=color)
            y -= leading
            row = word
        else:
            row = candidate
    if row:
        text(c, row, x, y, size, color=color)
    return y


def phone(c, name, x, y, width, report=False):
    height = width * 2.22
    c.setFillColor(Color(0.12, 0.10, 0.07, alpha=0.13))
    c.roundRect(x + 5, y - 6, width, height, width * .12, stroke=0, fill=1)
    c.setFillColor(HexColor("#252623"))
    c.setStrokeColor(HexColor("#55534d"))
    c.setLineWidth(.7)
    c.roundRect(x, y, width, height, width * .12, stroke=1, fill=1)
    sx, sy, sw, sh = x + 6, y + 11, width - 12, height - 24
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(sx, sy, sw, sh, width * .085)
    c.clipPath(clip, stroke=0)
    if report:
        c.setFillColor(HexColor("#eeeeeb"))
        c.rect(sx, sy, sw, sh, fill=1, stroke=0)
        top = sy + sh
        for image in ["report-1.png", "report-2.png"]:
            im = ImageReader(str(ASSETS / image))
            iw, ih = im.getSize()
            rh = sw * ih / iw
            top -= rh
            c.drawImage(im, sx, top, sw, rh)
            top -= 5
    else:
        c.setFillColor(PAPER)
        c.rect(sx, sy, sw, sh, fill=1, stroke=0)
        im = ImageReader(str(ASSETS / name))
        iw, ih = im.getSize()
        # Preserve the complete app viewport, including the map's outer edge.
        scale = min(sw / iw, sh / ih)
        c.drawImage(im, sx + (sw - iw * scale) / 2, sy + (sh - ih * scale) / 2, iw * scale, ih * scale)
    c.restoreState()
    c.setFillColor(HexColor("#11130f"))
    c.roundRect(x + width * .38, y + height - 7, width * .24, 3, 1.5, fill=1, stroke=0)
    return height


def qr(c, value, x, y, size):
    c.setFillColor(HexColor("#ffffff"))
    c.roundRect(x, y, size, size, 10, fill=1, stroke=0)
    code = QrCodeWidget(value, barLevel="M")
    bounds = code.getBounds()
    extent = bounds[2] - bounds[0]
    inset = 7
    factor = (size - inset * 2) / extent
    drawing = Drawing(size - inset * 2, size - inset * 2, transform=[factor, 0, 0, factor, 0, 0])
    drawing.add(code)
    renderPDF.draw(drawing, c, x + inset, y + inset)


def build(demo_url, registration_url):
    ASSETS.mkdir(parents=True, exist_ok=True)
    report = pdf.open(OFFER.parent / "kontekst-iz-repoa/ScanMe_Sajam-Izvestaji/JMEV - Zavrsni izvestaj - 09-11.10.2026.pdf")
    for i, page in enumerate(report):
        page.get_pixmap(matrix=pdf.Matrix(1.3, 1.3), alpha=False).save(ASSETS / f"report-{i + 1}.png")
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(W, H))
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    text(c, "SCANME × AUTO MOTO FEST 2026", 60, 634, 13, "AMFBold", ORANGE)
    text(c, "Vaši modeli na sajmu, merljivi.", 60, 573, 45, "AMFDisplay")
    wrap(c, "Posetilac skenira QR kod i vidi model, cenu i specifikacije. Vi dobijate kontakte zainteresovanih i izveštaj o tome šta je privuklo pažnju.", 60, 532, 700, 15, 22)
    text(c, "Probajte sami", 800, 622, 23, "AMFDisplay")
    wrap(c, "Skenirajte QR kod telefonom i isprobajte demo.", 800, 594, 145, 13, 19)
    text(c, demo_url.replace("https://www.", ""), 800, 505, 8, color=MUTED)
    qr(c, demo_url, 970, 483, 172)
    for caption, x in [("Mapa", 188), ("Stranica modela", 394), ("Garaža", 1012)]:
        center(c, caption, x, 468, 16, "AMFDisplay")
    center(c, "Pasoš brenda", 703, 468, 16, "AMFDisplay")
    center(c, "Pregled svih pasoša", 600, 450, 10, "AMFBody", MUTED)
    center(c, "Pasoš sa markicama", 806, 450, 10, "AMFBody", MUTED)
    for image, x in [("demo-map.jpg", 100), ("model.jpg", 306), ("passports.jpg", 512), ("passport-stamps.jpg", 718), ("garage.jpg", 924)]:
        phone(c, image, x, 48, 176)
    c.setStrokeColor(LINE)
    c.line(704, 78, 704, 425)
    text(c, "Hala Čair, Niš · 30. oktobar – 1. novembar 2026 · ScanMe je digitalni partner Sajma automobila.", 60, 19, 9, color=MUTED)
    c.showPage()
    # Overlay for the three retired screenshot placeholders on slide two.
    phone(c, "model.jpg", 165, 226, 130)
    phone(c, "garage.jpg", 455, 226, 130)
    phone(c, "passport-stamps.jpg", 615, 226, 130)
    phone(c, "report-1.png", 905, 226, 130, report=True)
    center(c, "Garaža", 520, 216, 10, "AMFBody", MUTED)
    center(c, "Markice", 680, 216, 10, "AMFBody", MUTED)
    c.showPage()
    qr(c, registration_url, 620, H - 447, 112)
    c.showPage()
    c.save()
    overlays = pdf.open(stream=buffer.getvalue(), filetype="pdf")
    original = pdf.open(SOURCE)
    out = pdf.open()
    first = out.new_page(width=W, height=H)
    first.show_pdf_page(first.rect, overlays, 0)
    out.insert_pdf(original, from_page=1)
    second = out[1]
    for box in [(58, 154, 402, 457), (428, 154, 772, 457), (798, 154, 1142, 457)]:
        second.add_redact_annot(pdf.Rect(*box), fill=tuple(PAPER.rgb()))
    second.apply_redactions()
    second.show_pdf_page(second.rect, overlays, 1)
    last = out[5]
    last.add_redact_annot(pdf.Rect(619, 334, 734, 448), fill=tuple(PAPER.rgb()))
    last.apply_redactions()
    last.show_pdf_page(last.rect, overlays, 2)
    out[0].insert_link({"kind": pdf.LINK_URI, "from": pdf.Rect(970, H - 655, 1142, H - 483), "uri": demo_url})
    last.insert_link({"kind": pdf.LINK_URI, "from": pdf.Rect(620, 335, 732, 447), "uri": registration_url})
    for page in out:
        page.insert_font(fontname="draft", fontfile="C:/Windows/Fonts/arialbd.ttf")
        page.insert_text((W - 180, 14), "RADNI PREGLED · NE SLATI", fontsize=8, fontname="draft", color=(.75, .25, .08))
    out.set_metadata({"title": "ScanMe × AMF 2026 - radni pregled ponude", "author": "ScanMe"})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, garbage=4, deflate=True)
    for i, page in enumerate(out):
        page.get_pixmap(matrix=pdf.Matrix(1.5, 1.5), alpha=False).save(ROOT / f"output/amf-ponuda/slide-{i + 1}.png")
    print(OUT)
    print("pages", len(out), "QR", demo_url)
    print("screenshot placeholders on slides 1-2:", sum(page.get_text().count("SCREENSHOT") for page in list(out)[:2]))
    # Standalone vector codes, using exactly the URLs embedded in the offer.
    from reportlab.graphics import renderSVG
    for name, url in [("demo", demo_url), ("prijava", registration_url)]:
        code = QrCodeWidget(url, barLevel="M")
        x1, y1, x2, y2 = code.getBounds()
        drawing = Drawing(x2 - x1, y2 - y1)
        drawing.add(code)
        renderSVG.drawToFile(drawing, str(ROOT / f"output/amf-ponuda/qr-{name}.svg"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo-url", required=True)
    parser.add_argument("--registration-url", required=True)
    args = parser.parse_args()
    build(args.demo_url, args.registration_url)
