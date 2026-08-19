import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

// Renders the analysis section into a paginated A4 PDF with a simple title header.
export default function ExportPdfButton({ targetRef, title, subtitle }) {
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

      const drawHeader = () => {
        pdf.setFontSize(15);
        pdf.setTextColor(15, 23, 42);
        pdf.text(title || "Analysis", margin, margin + 14);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        if (subtitle) pdf.text(subtitle, margin, margin + 30);
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
        offset += sliceH;
        page += 1;
      }

      const safe = (title || "analysis").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
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