import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

// Renders the analysis section into a paginated A4 PDF with a title header and
// a footer on every page.
//
// The footer is per-page on purpose. The disclosure block inside the report is
// the last thing on the page, so on a multi-page export page one carried an
// account name, a date range, account equity and a table of monthly realized
// P/L with nothing on it saying what the document was -- and any single page
// pulled out of the file was an unlabelled realized-P/L schedule. This is the
// one artifact that leaves the product, and it was the only surface missing
// the not-advice line the rest of the app carries in its footer.
//
// `isPaper` is separate and not cosmetic: a simulated account must not produce
// a document indistinguishable from a real one. Index options are paper-only
// on Alpaca today, so an index report is simulated by definition.
// `viewLabel` travels to the FOOTER, not just the header, and that is a
// correctness fix rather than a flourish. `drawHeader` runs on page 0 only and
// the header is the only thing that names the view. On a real account the
// monthly and ticker tables land on page two -- so page two of a Premium-only
// export was an unlabelled schedule of monthly P/L that excludes every share
// disposal in the account. Putting those tables under the view switch is what
// made that reachable.
export default function ExportPdfButton({ targetRef, title, subtitle, isPaper = false, viewLabel = null, withheld = null }) {
  const [busy, setBusy] = useState(false);

  const exportPdf = async () => {
    if (!targetRef.current || busy) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
      ]);
      // Each top-level section of the report is rendered on its own, rather
      // than the whole page as one tall image.
      //
      // The old way captured everything into a single canvas and cut it at a
      // fixed pixel height per page, which put the page break wherever it
      // happened to land -- straight through the equity curve, or through a
      // table's header row. Rendering per section means a break can only ever
      // fall between sections: a block that does not fit in what is left of a
      // page moves to the next one whole.
      //
      // A section taller than a whole page is still sliced, because it has to
      // be, but that is now the exception rather than what happens to every
      // page boundary.
      const root = targetRef.current;
      const blocks = Array.from(root.children).filter((el) => el.offsetHeight > 0);
      const canvases = [];
      for (const el of blocks.length ? blocks : [root]) {
        canvases.push(
          await html2canvas(el, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            windowWidth: 1400
          })
        );
      }

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 28;
      // Room for a banner line above the title on a paper export, and for two
      // footer lines the page image must not be allowed to run over.
      const headerH = (isPaper ? 68 : 54) + (withheld?.count ? 14 : 0);
      // WHAT THE PAGES AFTER THE FIRST NEED TO SAY.
      //
      // The on-screen note is a block near the top of the flow, so it is on
      // page one and nowhere else. Pages two onward are the by-month and
      // by-ticker realized-P/L tables -- the most schedule-shaped thing this
      // product emits, and the pages someone forwards to an accountant. They
      // carried a category disclaimer ("not a tax document") and nothing about
      // WHICH figures on them are qualified.
      //
      // This file already makes the argument, twelve lines up, about the paper
      // banner: "a 7pt grey footer line is not the same warning as an 11pt red
      // one at the top". The same applies here.
      //
      // The wording is the one that is true after the redesign, and it is not
      // the one the tax review proposed, because the design changed underneath
      // it. Nothing is EXCLUDED from these tables any more -- the money is in
      // every total and ties to the broker. What is qualified is the per-trade
      // outcome statistics, so that is what the line says.
      const n = withheld?.count || 0;
      const withheldLine = n
        ? `${n} ${n === 1 ? "TRADE'S RESULT CANNOT BE ATTRIBUTED" : "TRADES' RESULTS CANNOT BE ATTRIBUTED"} — TOTALS INCLUDE ${n === 1 ? "IT" : "THEM"}; WIN RATE, AVERAGES AND STREAKS DO NOT`
        : null;
      // Each banner line is its own 16pt band, and they stack. Reserving the
      // room is what stops the page image being drawn over the warning.
      const bannerLines = [isPaper ? "paper" : null, withheldLine ? "withheld" : null].filter(Boolean);
      const bannerH = bannerLines.length * 16;
      const disclaimer =
        "DeltaMint is not a broker-dealer and does not provide investment advice. Options trading involves " +
        "substantial risk of loss and is not suitable for every investor. Trades are placed through your own " +
        "brokerage account, under that broker's terms; DeltaMint never holds your funds or securities.";
      const imgW = pw - margin * 2;

      // Measured, not assumed. The footer used to draw the first three wrapped
      // lines and drop the rest -- silently, in the change whose point was that
      // this text must not be shortened. Whatever it wraps to is what the page
      // makes room for.
      pdf.setFontSize(6.5);
      const disclaimerLines = pdf.splitTextToSize(disclaimer, imgW);
      const footerH = 22 + disclaimerLines.length * 8;

      const usableFirst = ph - margin * 2 - headerH - footerH;
      const usableRest = ph - margin * 2 - footerH - bannerH;

      // Anything drawn as one string is clipped from the right when it does not
      // fit, and the account name comes first -- so "Wife's Roth IRA — Alpaca
      // Paper (long name)  —  PAPER, SIMULATED" lost precisely the words that
      // make the document honest, silently, on exactly the accounts with the
      // longest names. The title is truncated to fit; the banner is its own
      // element and cannot be pushed off by anything.
      const fit = (text, width) => {
        if (pdf.getTextWidth(text) <= width) return text;
        let cut = text;
        while (cut.length > 1 && pdf.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
        return `${cut}…`;
      };

      const drawBanner = (y) => {
        let at = y;
        if (isPaper) {
          pdf.setFontSize(11);
          pdf.setTextColor(180, 72, 92);
          pdf.text("PAPER TRADING — SIMULATED RESULTS, NOT REAL MONEY", margin, at);
          at += 16;
        }
        if (withheldLine) {
          // Smaller than the paper banner and in a different red: one says the
          // money is not real, the other says one row's attribution is not
          // settled. Giving them the same weight would flatten the difference.
          pdf.setFontSize(8.5);
          pdf.setTextColor(160, 60, 60);
          pdf.text(fit(withheldLine, imgW), margin, at);
        }
      };

      const drawHeader = () => {
        let y = margin + 14;
        if (bannerLines.length) {
          drawBanner(y);
          y += 2 + bannerLines.length * 16;
        }
        pdf.setFontSize(15);
        pdf.setTextColor(isPaper ? 180 : 15, isPaper ? 72 : 23, isPaper ? 92 : 42);
        pdf.text(fit(title || "Analysis", imgW), margin, y);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        if (subtitle) pdf.text(fit(subtitle, imgW), margin, y + 16);
        // Named on the cover, so a reader can find the rows on a broker
        // statement without hunting the body for the note.
        if (withheld?.names?.length) {
          pdf.setFontSize(8);
          pdf.setTextColor(160, 60, 60);
          pdf.text(
            fit(`Unattributed: ${withheld.names.slice(0, 6).join(", ")}${withheld.names.length > 6 ? `, +${withheld.names.length - 6} more` : ""}`, imgW),
            margin,
            y + (subtitle ? 30 : 16)
          );
        }
      };

      // The same disclosure the application carries on every screen. The export
      // is the one artifact that leaves the product and gets forwarded, and it
      // was saying less than the page it was exported from: no line that
      // DeltaMint is not a broker-dealer, and none that options carry a
      // substantial risk of loss.
      const drawFooter = (n) => {
        const view = viewLabel ? ` ${viewLabel}.` : "";
        // The completeness clause rides in the IDENTITY line, which is on every
        // page. A disclaimer about what kind of document this is does not tell
        // a reader that the win rate on the page they are looking at was
        // measured over fewer trades than the totals beside it.
        const unattributed = n
          ? ` ${n} ${n === 1 ? "trade's result is" : "trades' results are"} unattributed: in the totals, not in the rates — see page 1.`
          : "";
        const identity = isPaper
          ? `DeltaMint — PAPER TRADING, SIMULATED RESULTS.${view}${unattributed} Not a tax document and not investment advice.`
          : `DeltaMint — economic performance report.${view}${unattributed} Not a tax document and not investment advice.`;
        pdf.setFontSize(7);
        pdf.setTextColor(120, 130, 150);
        const identityY = ph - 22 - (disclaimerLines.length - 1) * 8;
        // Wrapped rather than truncated once the completeness clause is on it:
        // `fit` drops from the RIGHT, which is exactly where that clause sits,
        // so a long account name would have silently eaten the one sentence
        // this change exists to add.
        pdf.setFontSize(7);
        const identityLines = pdf.splitTextToSize(identity, imgW - 40);
        identityLines.slice(0, 2).forEach((line, i) => {
          pdf.text(line, margin, identityY + i * 8);
        });
        pdf.text(`Page ${n}`, pw - margin, identityY, { align: "right" });

        // Wrapped, not truncated. Cut to one line this text ends somewhere
        // around "does not provide investment" -- which drops the risk warning
        // and keeps the reassuring half, the one way of shortening it that is
        // worse than omitting it.
        pdf.setFontSize(6.5);
        const top = ph - 14 - (disclaimerLines.length - 1) * 8;
        disclaimerLines.forEach((line, i) => pdf.text(line, margin, top + i * 8));
      };

      // The report flows block by block. A page is started, blocks are placed
      // down it, and the moment one does not fit it moves to the next page
      // rather than being cut.
      const GAP = 10; // the space-y between sections, kept in the export
      let page = 0;
      let cursor = 0; // pt used on the current page, below its header
      const pageTop = () => margin + (page === 0 ? headerH : bannerH);
      const pageUsable = () => (page === 0 ? usableFirst : usableRest);

      const startPage = () => {
        if (page > 0) pdf.addPage();
        if (page === 0) drawHeader();
        else drawBanner(margin + 10);
        drawFooter(page + 1);
        cursor = 0;
      };
      startPage();

      for (const c of canvases) {
        const scale = imgW / c.width;
        const h = c.height * scale;
        const remaining = pageUsable() - cursor;

        // Fits where we are: place it.
        if (h <= remaining) {
          pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", margin, pageTop() + cursor, imgW, h);
          cursor += h + GAP;
          continue;
        }

        // Does not fit, but would fit on a page of its own: move it whole.
        // This is the case that used to cut a chart in half.
        if (h <= usableRest) {
          page += 1;
          startPage();
          pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", margin, pageTop() + cursor, imgW, h);
          cursor += h + GAP;
          continue;
        }

        // Taller than any page, so it has to be split. Only a long table
        // reaches this, and a table survives a break between rows.
        if (cursor > 0) {
          page += 1;
          startPage();
        }
        let offset = 0; // canvas px
        while (offset < c.height) {
          const sliceH = Math.min(c.height - offset, (pageUsable() - cursor) / scale);
          const slice = document.createElement("canvas");
          slice.width = c.width;
          slice.height = sliceH;
          slice.getContext("2d").drawImage(c, 0, -offset);
          pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, pageTop() + cursor, imgW, sliceH * scale);
          offset += sliceH;
          cursor += sliceH * scale;
          if (offset < c.height) {
            page += 1;
            startPage();
          }
        }
        cursor += GAP;
      }

      const safe = `${isPaper ? "paper-" : ""}${title || "analysis"}`
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
      pdf.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={exportPdf}
      disabled={busy}
      className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm hover:bg-emerald-100 transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {busy ? "Building PDF…" : "Export PDF"}
    </button>
  );
}