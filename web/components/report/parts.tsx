import type { ReactNode } from "react";

/** Building blocks shared by the three reports. Fixed light colours: this is a document,
 * so it looks the same on screen in either theme and on paper. */

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="break-after-avoid border-b border-neutral-300 pb-1.5 text-lg font-semibold">{title}</h2>
      {note && <p className="mt-2 break-after-avoid text-[13px] text-neutral-600">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Figures({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="break-inside-avoid rounded-lg border border-neutral-300 p-3">
          <dt className="text-[12px] text-neutral-600">{i.label}</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Points({ items, empty = "None." }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-neutral-600">{empty}</p>;
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((it, i) => (
        <li key={i} className="break-inside-avoid">
          {it}
        </li>
      ))}
    </ol>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-left text-[13px] leading-relaxed">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border border-neutral-300 bg-neutral-100 px-2 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="break-inside-avoid">
              {row.map((cell, j) => (
                <td key={j} className="border border-neutral-300 px-2 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
