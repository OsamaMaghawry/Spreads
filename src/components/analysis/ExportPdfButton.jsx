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
export default function ExportPdfButton({ targetRef, title, subtitle, isPaper = false }) {
  const [busy, setBusy] = useState(false);

  const exportPdf = async () => {
    if (!targetRef.current || busy) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf")
      ]);
      const canvas = await html2canvas(targetRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: 1400
      });

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 28;
      // Room for a banner line above the title on a paper export, and for two
      // footer lines the page image must not be allowed to run over.
      const headerH = isPaper ? 68 : 54;
      // A red banner on every page, not only the first. Page two of a paper
      // export is a monthly realized-P/L schedule, and a 7pt grey footer line
      // is not the same warning as an 11pt red one at the top.
      const bannerH = isPaper ? 16 : 0;
      const disclaimer =
        "DeltaMint is not a broker-dealer and does not provide investment advice. Options trading involves " +
        "substantial risk of loss and is not suitable for every investor. Trades are placed through your own " +
        "brokerage account, under that broker's terms; DeltaMint never holds your funds or securities.";
      const imgW = pw - margin * 2;
      const scale = imgW / canvas.width;

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
        if (!isPaper) return;
        pdf.setFontSize(11);
        pdf.setTextColor(180, 72, 92);
        pdf.text("PAPER TRADING — SIMULATED RESULTS, NOT REAL MONEY", margin, y);
      };

      const drawHeader = () => {
        let y = margin + 14;
        if (isPaper) {
          drawBanner(y);
          y += 18;
        }
        pdf.setFontSize(15);
        pdf.setTextColor(isPaper ? 180 : 15, isPaper ? 72 : 23, isPaper ? 92 : 42);
        pdf.text(fit(title || "Analysis", imgW), margin, y);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        if (subtitle) pdf.text(fit(subtitle, imgW), margin, y + 16);
      };

      // The same disclosure the application carries on every screen. The export
      // is the one artifact that leaves the product and gets forwarded, and it
      // was saying less than the page it was exported from: no line that
      // DeltaMint is not a broker-dealer, and none that options carry a
      // substantial risk of loss.
      const drawFooter = (n) => {
        const identity = isPaper
          ? "DeltaMint — PAPER TRADING, SIMULATED RESULTS. Not a tax document and not investment advice."
          : "DeltaMint — economic performance report. Not a tax document and not investment advice.";
        pdf.setFontSize(7);
        pdf.setTextColor(120, 130, 150);
        const identityY = ph - 22 - (disclaimerLines.length - 1) * 8;
        pdf.text(fit(identity, imgW - 40), margin, identityY);
        pdf.text(`Page ${n}`, pw - margin, identityY, { align: "right" });

        // Wrapped, not truncated. Cut to one line this text ends somewhere
        // around "does not provide investment" -- which drops the risk warning
        // and keeps the reassuring half, the one way of shortening it that is
        // worse than omitting it.
        pdf.setFontSize(6.5);
        const top = ph - 14 - (disclaimerLines.length - 1) * 8;
        disclaimerLines.forEach((line, i) => pdf.text(line, margin, top + i * 8));
      };

      let offset = 0; // in canvas px
      let page = 0;
      while (offset < canvas.height) {
        const usable = page === 0 ? usableFirst : usableRest;
        const sliceH = Math.min(canvas.height - offset, usable / scale);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        slice.getContext("2d").drawImage(canvas, 0, -offset);
        if (page > 0) pdf.addPage();
        if (page === 0) drawHeader();
        else drawBanner(margin + 10);
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margin,
          margin + (page === 0 ? headerH : bannerH),
          imgW,
          sliceH * scale
        );
        drawFooter(page + 1);
        offset += sliceH;
        page += 1;
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