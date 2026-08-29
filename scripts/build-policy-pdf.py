#!/usr/bin/env python3
"""Render docs/legal/cybersecurity-policy.md to the deliverable PDF.

The Information Security Policy is submitted to a broker as a PDF, but it is
maintained as Markdown so it reviews and diffs like everything else. This script
is the bridge, committed rather than ad hoc so the next revision does not have
to rediscover it.

Handles only the Markdown this document actually uses: H1/H2, blockquote,
pipe tables, bullet and numbered lists, `code`, **bold**, and paragraphs.

Four defects were found the first time this was rendered, and each is guarded
against here rather than left to chance:

  * `<iv>` and `<ciphertext>` in the AES format spec vanished, because reportlab
    parses its own markup and swallowed them as unknown tags. Everything is
    XML-escaped before any markup is added back.
  * Lists collapsed into run-on paragraphs. Bullets and numbers are emitted as
    their own flowables with an indent.
  * The warning glyph rendered as a black box, since Helvetica has no such
    character. Non-Latin-1 characters are mapped to plain-text equivalents.
  * The metadata box clipped its last line. There is no box now - the owner,
    contact, version and review-cycle lines are ordinary paragraphs, so nothing
    is sized to its content and nothing can clip.

Usage: python3 scripts/build-policy-pdf.py
"""

import html
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs/legal/cybersecurity-policy.md"
OUTPUT = ROOT / "docs/legal/deliverables/information-security-policy.pdf"

# Helvetica is Latin-1 only, so anything outside it is drawn as a black box.
# Substituting here keeps the source Markdown readable while the PDF stays
# printable on the base fourteen fonts, with no font file to ship.
GLYPHS = {
    "—": "-",       # em dash
    "–": "-",       # en dash
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "⚠": "[!]",     # warning sign
    "→": "->",
    " ": " ",
}


def plain(text):
    for bad, good in GLYPHS.items():
        text = text.replace(bad, good)
    return text


def inline(text):
    """Escape first, then add markup. Never the other way round."""
    text = html.escape(plain(text), quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.5">\1</font>', text)
    return text


def styles():
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        spaceAfter=7,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#1a1a1a"),
    )
    return {
        "body": body,
        "h1": ParagraphStyle("H1", parent=body, fontName="Helvetica-Bold", fontSize=17,
                             leading=21, spaceBefore=2, spaceAfter=10),
        "h2": ParagraphStyle("H2", parent=body, fontName="Helvetica-Bold", fontSize=11.5,
                             leading=15, spaceBefore=16, spaceAfter=6),
        "quote": ParagraphStyle("Quote", parent=body, fontSize=8.8, leading=12.5,
                                leftIndent=10, textColor=colors.HexColor("#444444")),
        "bullet": ParagraphStyle("Bullet", parent=body, leftIndent=16, bulletIndent=4,
                                 spaceAfter=4),
        "cell": ParagraphStyle("Cell", parent=body, fontSize=8.5, leading=11.5, spaceAfter=0),
        "cellhead": ParagraphStyle("CellHead", parent=body, fontName="Helvetica-Bold",
                                   fontSize=8.5, leading=11.5, spaceAfter=0),
    }


def build_table(rows, s):
    header, *body = rows
    data = [[Paragraph(inline(c), s["cellhead"]) for c in header]]
    data += [[Paragraph(inline(c), s["cell"]) for c in r] for r in body]
    width = 6.6 * inch
    table = Table(data, colWidths=[width / len(header)] * len(header), repeatRows=1)
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2f2f2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def parse(markdown, s):
    story = []
    lines = markdown.split("\n")
    i = 0
    paragraph = []

    def flush():
        if paragraph:
            story.append(Paragraph(inline(" ".join(paragraph)), s["body"]))
            paragraph.clear()

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            flush()
            i += 1
            continue

        if stripped.startswith("# "):
            flush()
            story.append(Paragraph(inline(stripped[2:]), s["h1"]))
        elif stripped.startswith("## "):
            flush()
            story.append(Paragraph(inline(stripped[3:]), s["h2"]))
        elif stripped.startswith(">"):
            flush()
            block = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                block.append(lines[i].strip().lstrip(">").strip())
                i += 1
            # Blank ">" lines separate paragraphs inside the quote.
            for chunk in " \n".join(block).split(" \n \n"):
                if chunk.strip():
                    story.append(Paragraph(inline(chunk.replace(" \n", " ")), s["quote"]))
            story.append(Spacer(1, 4))
            continue
        elif stripped.startswith("|"):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            story.append(Spacer(1, 2))
            story.append(build_table(rows, s))
            story.append(Spacer(1, 8))
            continue
        elif re.match(r"^[-*] ", stripped) or re.match(r"^\d+\. ", stripped):
            flush()
            numbered = bool(re.match(r"^\d+\. ", stripped))
            marker = stripped.split(" ", 1)[0] if numbered else "•"
            text = stripped.split(" ", 1)[1]
            # A wrapped list item continues on indented lines.
            i += 1
            while i < len(lines) and lines[i].startswith("  ") and lines[i].strip() \
                    and not re.match(r"^\s*([-*]|\d+\.) ", lines[i]):
                text += " " + lines[i].strip()
                i += 1
            story.append(Paragraph(inline(text), s["bullet"], bulletText=plain(marker)))
            continue
        else:
            # A line opening with a bold label and colon - Owner:, Contact:,
            # Version:, Review cycle: - starts its own paragraph. Markdown treats
            # consecutive lines as one, which ran the four metadata lines
            # together into a single sentence-like blur at the top of the page.
            # Only the break before is forced, so a label whose text wraps onto
            # the next line still keeps it.
            if re.match(r"^\*\*[A-Z][^*]*:\*\*", stripped):
                flush()
            paragraph.append(stripped)
        i += 1

    flush()
    return story


class Doc(BaseDocTemplate):
    def __init__(self, path, title):
        super().__init__(str(path), pagesize=LETTER,
                         leftMargin=0.9 * inch, rightMargin=0.9 * inch,
                         topMargin=0.95 * inch, bottomMargin=0.85 * inch,
                         title=title, author="Optvest Inc.")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=self.decorate)])
        self.header = title

    def decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.drawString(self.leftMargin, LETTER[1] - 0.6 * inch, self.header)
        canvas.drawRightString(LETTER[0] - self.rightMargin, 0.55 * inch,
                               "Page %d" % doc.page)
        canvas.setStrokeColor(colors.HexColor("#dddddd"))
        canvas.setLineWidth(0.4)
        canvas.line(self.leftMargin, LETTER[1] - 0.68 * inch,
                    LETTER[0] - self.rightMargin, LETTER[1] - 0.68 * inch)
        canvas.restoreState()


def main():
    markdown = SOURCE.read_text(encoding="utf-8")

    version = re.search(r"\*\*Version:\*\* *([^\n]+)", markdown)
    title = "DeltaMint - Information Security Policy"
    if version:
        title += " - v" + plain(version.group(1)).split(" ")[0]

    s = styles()
    story = parse(markdown, s)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Doc(OUTPUT, title).build(story)
    print("Wrote %s" % OUTPUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
