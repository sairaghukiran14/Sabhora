import type { ReactNode } from "react";
import NextLink from "next/link";
import SiteNav from "./SiteNav";
import Footer from "./Footer";
import { Container } from "../ui";
import { LEGAL } from "@/lib/legal";

/** Shared frame for /terms and /privacy: a readable column, a contents list, and a clear
 * draft note while the company details in lib/legal.ts are still missing. */
export default function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: { id: string; heading: string; body: ReactNode }[];
}) {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
          <p className="text-[13px] font-medium text-muted">Last updated {LEGAL.updated}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {!LEGAL.ready && (
            <p role="note" className="mt-5 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm leading-relaxed">
              <span className="font-medium">Draft.</span> {LEGAL.product} is in early testing.
              Our company details and a named grievance officer will be added here before we
              accept payments, and these terms are still being reviewed by a lawyer.
            </p>
          )}
          <div className="mt-6 text-[15px] leading-relaxed text-muted">{intro}</div>
          <nav aria-label="On this page" className="mt-8 rounded-2xl border border-edge bg-surface p-5">
            <p className="text-[13px] font-medium text-ink">On this page</p>
            <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted hover:text-ink">
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-10 space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="font-display text-xl font-bold tracking-tight">
                  {i + 1}. {s.heading}
                </h2>
                <div className="legal-body mt-3 space-y-3 text-[15px] leading-relaxed text-muted [&_a]:text-brand-ink [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
          <p className="mt-12 border-t border-edge pt-6 text-sm text-muted">
            See also the{" "}
            <NextLink href={title.startsWith("Terms") ? "/privacy" : "/terms"} className="text-brand-ink underline">
              {title.startsWith("Terms") ? "Privacy policy" : "Terms of use"}
            </NextLink>
            .
          </p>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
