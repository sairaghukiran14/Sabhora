import NextLink from "next/link";
import { Container, Logo } from "../ui";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Rooms",
    links: [
      { href: "/signup?next=%2Fdashboard%2Fnew%3Froom%3Dsharks", label: "Sharks" },
      { href: "/signup?next=%2Fdashboard%2Fnew%3Froom%3Djanta", label: "Janta" },
      { href: "/signup?next=%2Fdashboard%2Fnew%3Froom%3Droast", label: "Roast" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Create account" },
      { href: "/login", label: "Log in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-edge bg-surface">
      <Container className="grid gap-10 py-12 sm:py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Hear what AI investor, crowd and reviewer personas may push back on, before you take your idea to real people.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-[13px] font-medium text-ink">{c.title}</p>
            <ul className="mt-3 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  <NextLink href={l.href} className="text-sm text-muted transition-colors hover:text-ink">
                    {l.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-edge">
        <Container className="flex flex-col gap-2 py-6 text-[13px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>Sabhora by Neevora Labs. Made in India.</span>
          <span>AI personas give fast signal, not a guarantee. Always talk to real customers too.</span>
        </Container>
      </div>
    </footer>
  );
}
