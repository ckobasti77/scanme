"""Owner-requested offer revision; keep the supplied draft and previous preview intact."""
from pathlib import Path
from io import BytesIO
import importlib.util
import json
import pymupdf as pdf
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "output/amf-ponuda/revizija-2026-10-19"
OUT = ROOT / "output/pdf/AMF-2026-Ponuda-izlagacima-REVIZIJA-2026-10-19.pdf"
spec = importlib.util.spec_from_file_location("offer_base", Path(__file__).with_name("build-amf-offer-preview.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
W, H = base.W, base.H
PAPER, INK, MUTED, ORANGE, LINE = map(HexColor, ["#faf6ee", "#211e19", "#655d51", "#d95119", "#ded4c3"])
GREEN, WHITE, SOFT = map(HexColor, ["#6fc05d", "#fffdf8", "#eef5e9"])
BRANDS = []


def text(c, value, x, y, size=14, font="AMFBody", color=INK):
    base.text(c, value, x, y, size, font, color)


def center(c, value, x, y, size=14, font="AMFBold", color=INK):
    base.center(c, value, x, y, size, font, color)


def wrap(c, value, x, y, width, size=14, leading=20, color=MUTED):
    return base.wrap(c, value, x, y, width, size, leading, color)


def paper(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def card(c, x, y, width, height, color=WHITE):
    c.setFillColor(color)
    c.setStrokeColor(LINE)
    c.setLineWidth(.7)
    c.roundRect(x, y, width, height, 16, fill=1, stroke=1)


def brand_at(c, x, y, width):
    BRANDS.append((c.getPageNumber() - 1, pdf.Rect(x, H - y - width / 7.286, x + width, H - y)))


def phone(c, name, cx, y, width, report=False):
    # The approved silver hardware is an image asset, not nested rectangles.
    # Its transparent central opening receives a real browser capture.
    scale = width / 740
    left = cx - 512 * scale
    sx, sy, sw, sh = left + 176 * scale, y + (1536 - 1404) * scale, 670 * scale, 1264 * scale
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(sx, sy, sw, sh, 35 * scale)
    c.clipPath(clip, fill=0, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.rect(sx, sy, sw, sh, fill=1, stroke=0)
    if report:
        top = sy + sh
        for image in ["report-redacted-1.png", "report-redacted-2.png"]:
            im = ImageReader(str(ASSETS / image))
            iw, ih = im.getSize()
            rh = sw * ih / iw
            top -= rh
            c.drawImage(im, sx, top, sw, rh)
            top -= 4 * scale
    else:
        c.drawImage(str(ASSETS / name), sx, sy, sw, sh, mask="auto")
    c.restoreState()
    c.drawImage(str(ASSETS / "phone-svetli-frame.png"), left, y, 1024 * scale, 1536 * scale, mask="auto")


def qr(c, url, x, y, size, heading):
    # Same chamfered top-left/bottom-right label silhouette as SA26-001.
    p = c.beginPath()
    cut, radius = size * .055, size * .025
    p.moveTo(x + cut, y + size)
    p.lineTo(x + size - radius, y + size)
    p.arcTo(x + size - 2 * radius, y + size - 2 * radius, x + size, y + size, 90, -90)
    p.lineTo(x + size, y + cut)
    p.lineTo(x + size - cut, y)
    p.lineTo(x + radius, y)
    p.arcTo(x, y, x + 2 * radius, y + 2 * radius, 270, -90)
    p.lineTo(x, y + size - cut)
    p.close()
    c.setFillColor(HexColor("#ffffff"))
    c.setStrokeColor(LINE)
    c.setLineWidth(.7)
    c.drawPath(p, fill=1, stroke=1)
    center(c, heading, x + size / 2, y + size * .902, size * .043, "AMFBold")
    code = QrCodeWidget(url, barLevel="M")
    bounds = code.getBounds()
    extent = bounds[2] - bounds[0]
    qr_size = size * .79
    factor = qr_size / extent
    drawing = Drawing(qr_size, qr_size, transform=[factor, 0, 0, factor, 0, 0])
    drawing.add(code)
    renderPDF.draw(drawing, c, x + (size - qr_size) / 2, y + size * .12)
    brand_at(c, x + size * .32, y + size * .055, size * .36)


def new_brand():
    doc = pdf.open()
    page = doc.new_page(width=516.299, height=70.866)
    for name, color in [("base", "#211e19"), ("accent", "#6fc05d")]:
        svg = (ROOT / f"public/brand/scanme-wordmark-{name}-mask.svg").read_text(encoding="utf-8")
        svg = svg.replace("#FFFFFF", color)
        graphic = pdf.open(stream=svg.encode(), filetype="svg")
        vector = pdf.open(stream=graphic.convert_to_pdf(), filetype="pdf")
        page.show_pdf_page(page.rect, vector, 0)
    return doc


def redact_reports(brand):
    report = pdf.open(base.OFFER.parent / "kontekst-iz-repoa/ScanMe_Sajam-Izvestaji/JMEV - Zavrsni izvestaj - 09-11.10.2026.pdf")
    names = ["JMEV", "CUBI d.o.o.", "EV3", "EWIND", "YI", "Geomerk"]
    for i, page in enumerate(report):
        for name in names:
            for rect in page.search_for(name):
                page.add_redact_annot(rect, fill=tuple(GREEN.rgb()), cross_out=False)
        page.add_redact_annot(pdf.Rect(30, 20, 160, 46), fill=(1, 1, 1), cross_out=False)
        page.apply_redactions()
        assert not any(page.search_for(name) for name in names)
        page.show_pdf_page(pdf.Rect(36, 25, 122, 37), brand, 0)
        page.get_pixmap(matrix=pdf.Matrix(2, 2), alpha=False).save(ASSETS / f"report-redacted-{i + 1}.png")


def build():
    ASSETS.mkdir(parents=True, exist_ok=True)
    brand = new_brand()
    redact_reports(brand)
    cards = json.loads((ROOT / "output/amf-ponuda/dynamic-qr.json").read_text(encoding="utf-8"))["cards"]
    demo_url, registration_url = [entry["url"] for entry in cards]
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(W, H))

    # Page 1: one screen per feature, four phones in total.
    paper(c)
    text(c, "SCANME × AUTO MOTO FEST 2026", 60, 634, 13, "AMFBold", ORANGE)
    text(c, "Vaši modeli na sajmu, merljivi.", 60, 573, 45, "AMFDisplay")
    wrap(c, "Posetilac skenira QR kod i vidi model, cenu i specifikacije. Vi dobijate kontakte zainteresovanih i izveštaj o tome šta je privuklo pažnju.", 60, 532, 700, 15, 22)
    text(c, "Probajte sami", 800, 625, 23, "AMFDisplay")
    wrap(c, "Skenirajte ili kliknite QR kod da otvorite demo.", 800, 595, 155, 13, 19)
    qr(c, demo_url, 980, 502, 154, "SKENIRAJ ZA SPECIFIKACIJE")
    for image, label, cx in [("map.png", "Mapa", 190), ("model.png", "Stranica modela", 463), ("passports.png", "Pasoši brendova", 736), ("garage.png", "Garaža", 1009)]:
        center(c, label, cx, 481, 17, "AMFDisplay")
        phone(c, image, cx, 45, 200)
    text(c, "Hala Čair, Niš · 30. oktobar - 1. novembar 2026 · ScanMe je digitalni partner Sajma automobila.", 60, 19, 9, color=MUTED)
    c.showPage()

    # Page 2: scanning first, then model + garage, then the anonymised report.
    paper(c)
    text(c, "KAKO RADI", 60, 611, 13, "AMFBold", ORANGE)
    text(c, "Tri koraka. Bez aplikacije, bez prijave.", 60, 555, 45, "AMFDisplay")
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(118, 226, 225, 300, 16)
    c.clipPath(clip, stroke=0)
    c.drawImage(str(ASSETS / "scan-action.png"), 118, 207, 225, 337.5)
    c.restoreState()
    phone(c, "model.png", 514, 221, 143)
    phone(c, "garage.png", 687, 221, 143)
    phone(c, "", 970, 221, 143, report=True)
    for number, x, title, body in [
        (1, 60, "Posetilac skenira", "QR nalepnica na automobilu otvara stranicu tog modela: cena, specifikacije i fotografija."),
        (2, 430, "Ocenjuje, čuva, javlja se", "Ocenjuje model, čuva ga u garažu i ostavlja kontakt za dalji razgovor ili probnu vožnju."),
        (3, 800, "Vi dobijate rezultat", "Kontakte zainteresovanih, ocene i interesovanje po modelu, u izveštaju koji vam šaljemo."),
    ]:
        c.setFillColor(ORANGE)
        c.roundRect(x, 170, 34, 34, 9, fill=1, stroke=0)
        center(c, str(number), x + 17, 180, 16, color=HexColor("#ffffff"))
        text(c, title, x, 135, 22, "AMFDisplay")
        wrap(c, body, x, 103, 335, 14, 21)
    c.showPage()

    # Page 3's existing analytics and wording are preserved.
    c.showPage()

    # Page 4: exact owner-supplied testimonial, on a light surface.
    card(c, 678, H - 400, 462, 192)
    quote = "Spoj QR kodova i stručne podrške tima stvorio je besprekorno iskustvo na štandu. Posetioci su pristupali informacijama direktno sa svojih telefona, a tim se fokusirao na kvalitetne, konkretne i brže razgovore."
    last_y = wrap(c, quote, 705, H - 244, 405, 16, 23, INK)
    text(c, "Iskustvo JMEV tima sa sajma", 705, last_y - 30, 11, color=MUTED)
    c.showPage()

    # Page 5: lighter Starter header and a positive discount treatment.
    c.setFillColor(HexColor("#eee8dc"))
    c.rect(408, H - 228, 120, 80, fill=1, stroke=0)
    center(c, "Starter", 468, H - 180, 19, "AMFDisplay")
    center(c, "3.000 RSD po", 468, H - 200, 12, "AMFBody")
    center(c, "vozilu", 468, H - 216, 12, "AMFBody")
    card(c, 750, H - 335, 390, 187, SOFT)
    text(c, "Popust na više vozila", 770, H - 185, 23, "AMFDisplay")
    wrap(c, "Dodatno, moguće je ostvariti popust po sledećem principu:", 770, H - 214, 347, 14, 20, INK)
    wrap(c, "1. Za 3+ vozila u paketu, svako sledeće ostvaruje 30% popusta na izabrani paket.", 770, H - 263, 347, 14, 20, INK)
    wrap(c, "2. Za 5 vozila u paketu, šesto dobija gratis paket.", 770, H - 312, 347, 14, 20, INK)
    c.showPage()

    # Page 6: this is an initial inquiry, not the later technical intake.
    paper(c)
    text(c, "SLEDEĆI KORAK", 60, 611, 13, "AMFBold", ORANGE)
    text(c, "Prijava do 23. oktobra u 17h.", 60, 555, 43, "AMFDisplay")
    for y, value in [(490, "Upišite modele i izaberite paket za svaki"), (437, "Pošaljite kratak upit sa svojim kontaktom"), (384, "Detalje i materijale dogovaramo nakon prijave"), (331, "Na postavci lepimo nalepnice i proveravamo svaku")]:
        c.setFillColor(ORANGE)
        c.roundRect(60, y - 9, 30, 30, 8, fill=1, stroke=0)
        c.setStrokeColor(HexColor("#ffffff"))
        c.setLineWidth(2)
        p = c.beginPath()
        p.moveTo(69, y + 5); p.lineTo(74, y); p.lineTo(82, y + 10)
        c.drawPath(p)
        text(c, value, 105, y, 17, "AMFBold")
    wrap(c, "QR nalepnicu i digitalnu stranicu dobija svako vozilo koje je u paketu. Vozilo van paketa nema nalepnicu.", 60, 250, 490, 14, 21)
    card(c, 620, 360, 520, 155)
    text(c, "Teodora · ScanMe", 648, 480, 24, "AMFDisplay")
    wrap(c, "Pošaljite upit kroz obrazac. Javićemo vam se da zajedno prođemo naredne korake.", 648, 445, 464, 16.5, 23, INK)
    text(c, "Telefon:", 648, 384, 14, "AMFBody", MUTED)
    text(c, "0666644488", 704, 384, 15, "AMFBold", INK)
    text(c, "·", 802, 384, 15, "AMFBold", MUTED)
    text(c, "Email:", 818, 384, 14, "AMFBody", MUTED)
    text(c, "office@scanme.rs", 863, 384, 15, "AMFBold", INK)
    qr(c, registration_url, 620, 133, 186, "PRIJAVA IZLAGAČA")
    text(c, "Prijavite svoja vozila", 830, 268, 24, "AMFDisplay")
    wrap(c, "Skenirajte ili kliknite QR kod da otvorite kratak obrazac.", 830, 230, 290, 17, 25, INK)
    text(c, "ScanMe · digitalni partner Sajma automobila 2026", 60, 25, 10, color=MUTED)
    c.showPage()
    c.save()

    overlay = pdf.open(stream=buffer.getvalue(), filetype="pdf")
    original = pdf.open(base.SOURCE)
    out = pdf.open()
    for i in range(6):
        if i in (0, 1, 5):
            page = out.new_page(width=W, height=H)
            page.show_pdf_page(page.rect, overlay, i)
        else:
            out.insert_pdf(original, from_page=i, to_page=i)
    page = out[3]
    page.add_redact_annot(pdf.Rect(677, 207, 1141, 401), fill=tuple(PAPER.rgb()), cross_out=False)
    page.apply_redactions()
    page.show_pdf_page(page.rect, overlay, 3)
    page = out[4]
    # Remove the orange label row and shift the four actual feature rows up.
    page.add_redact_annot(pdf.Rect(60, 458, 721, 608), fill=tuple(PAPER.rgb()), cross_out=False)
    page.add_redact_annot(pdf.Rect(408, 148, 528, 228), fill=tuple(PAPER.rgb()), cross_out=False)
    page.add_redact_annot(pdf.Rect(750, 147, 1141, 336), fill=tuple(PAPER.rgb()), cross_out=False)
    page.apply_redactions()
    page.show_pdf_page(pdf.Rect(60, 458, 721, 576), original, 4, clip=pdf.Rect(60, 489, 721, 607))
    page.show_pdf_page(page.rect, overlay, 4)
    for i, rect in BRANDS:
        out[i].show_pdf_page(rect, brand, 0)
    for i, page in enumerate(out):
        for link in list(page.get_links()):
            page.delete_link(link)
        # Retire the old text-only footer mark; use the actual current logo.
        page.add_redact_annot(pdf.Rect(850 if i == 2 else 1048, 632, 1151, 660), fill=tuple(PAPER.rgb()), cross_out=False)
        page.apply_redactions()
        page.show_pdf_page(pdf.Rect(1062, 639, 1140, 650), brand, 0)
    out[0].insert_link({"kind": pdf.LINK_URI, "from": pdf.Rect(980, H - 656, 1134, H - 502), "uri": demo_url})
    out[5].insert_link({"kind": pdf.LINK_URI, "from": pdf.Rect(620, H - 319, 806, H - 133), "uri": registration_url})
    out.set_metadata({"title": "ScanMe × Auto Moto Fest 2026 - Ponuda izlagačima", "author": "ScanMe"})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, garbage=4, deflate=True)
    final_out = OUT.with_name("AMF-2026-Ponuda-izlagacima-FINAL.pdf")
    out.save(final_out, garbage=4, deflate=True)
    final = pdf.open(OUT)
    assert len(final) == 6
    assert "DODATNO U NAPREDNOM" not in final[4].get_text()
    assert "[TELEFON]" not in final[5].get_text()
    assert "scanme.rs/r/" not in final[0].get_text()
    assert "besprekorno iskustvo na štandu" in final[3].get_text()
    for i, page in enumerate(final):
        page.get_pixmap(matrix=pdf.Matrix(1.5, 1.5), alpha=False).save(ASSETS / f"page-{i + 1}.png")
    print(OUT)
    print(json.dumps({"pages": len(final), "phoneChoice": 3, "phonesOnFirstPage": 4, "links": [final[0].get_links(), final[5].get_links()]}, ensure_ascii=False, default=str))


if __name__ == "__main__":
    build()
