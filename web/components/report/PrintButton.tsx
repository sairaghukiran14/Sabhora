"use client";

import { Download } from "../icons";
import { btn } from "../ui";

/** Opens the browser's save dialog. The page title becomes the suggested file name. */
export default function PrintButton({ fileName }: { fileName: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const before = document.title;
        document.title = fileName;
        window.addEventListener("afterprint", () => (document.title = before), { once: true });
        window.print();
      }}
      className={btn("brand", "md")}
    >
      <Download size={16} /> Download PDF
    </button>
  );
}
