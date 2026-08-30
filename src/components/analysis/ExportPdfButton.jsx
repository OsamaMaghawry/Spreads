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
      const headerH = 54;
      const imgW = pw - margin * 2;
      const scale = imgW / canvas.width;
      const usableFirst = ph - margin * 2 - headerH;
      const usableRest = ph - margin * 2;

      const heading = isPaper
        ? `${title || "Analysis"}  —  PAPER, SIMULATED`
        : title || "Analysis";

      const drawHeader = () => {
        pdf.setFontSize(15);
        if (isPaper) pdf.setTextColor(180, 72, 92);
        else pdf.setTextColor(15, 23, 42);
        pdf.text(heading, margin, margin + 14);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        if (subtitle) pdf.text(subtitle, margin, margin + 30);
      };

      const drawFooter = (n) => {
        pdf.setFontSize(7);
        pdf.setTextColor(120, 130, 150);
        const line = isPaper
          ? "DeltaMint — PAPER TRADING, SIMULATED RESULTS. Not a tax document and not investment advice."
          : "DeltaMint — economic performance report. Not a tax document and not investment advice.";
        pdf.text(line, margin, ph - 14);
        pdf.text(`Page ${n}`, pw - margin, ph - 14, { align: "right" });
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
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margin,
          margin + (page === 0 ? headerH : 0),
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