"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "../ThemeToggle";
import { useHydrated } from "../hooks";
import { Card, History, Home, Menu, Plus, Settings, Spark, User, X } from "../icons";
import { btn, cx, Logo } from "../ui";

const NAV = [
  { href: "/dashboard", label: "Home", Icon: Home, exact: true },
  { href: "/dashboard/new", label: "New run", Icon: Plus },
  { href: "/dashboard/runs", label: "My runs", Icon: History },
  { href: "/dashboard/billing", label: "Credits & billing", Icon: Card },
  { href: "/dashboard/profile", label: "Profile", Icon: User },
  { href: "/dashboard/settings", label: "Settings", Icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      {NAV.map(({ href, label, Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
        return (
          <li key={href}>
            <NextLink
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                active ? "text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId={onNavigate ? "nav-active-mobile" : "nav-active"}
                  className="absolute inset-0 rounded-xl bg-brand-soft"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <Icon size={18} className={cx("relative", active && "text-brand-ink")} />
              <span className="relative">{label}</span>
            </NextLink>
          </li>
        );
      })}
    </ul>
  );
}

function UpgradeCard() {
  return (
    <div className="rounded-2xl border border-edge bg-bg p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        <Spark size={16} />
      </span>
      <p className="mt-3 text-sm font-medium">Bigger crowds on Pro</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">Poll crowds of 50 or 100 people.</p>
      <NextLink href="/dashboard/billing" className="mt-3 inline-flex text-[13px] font-medium text-brand-ink hover:underline">
        See plans
      </NextLink>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-edge bg-surface px-4 py-5 lg:flex">
      <div className="px-2">
        <Logo href="/dashboard" />
      </div>
      <NextLink href="/dashboard/new" className={btn("brand", "md", "mt-6 w-full")}>
        <Plus size={18} /> New run
      </NextLink>
      <nav className="mt-6 flex-1" aria-label="Main">
        <Suspense fallback={null}>
          <NavList />
        </Suspense>
      </nav>
      <UpgradeCard />
      <div className="mt-4 flex items-center justify-between px-2 text-[13px] text-muted">
        Appearance
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const hydrated = useHydrated();

  // Close the drawer whenever the route changes (adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-edge"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu size={18} />
      </button>
      <Logo href="/dashboard" compact />

      {/* Portalled to <body>: the header's backdrop blur would otherwise trap fixed children inside it. */}
      {hydrated &&
        createPortal(
      <AnimatePresence>
        {open && (
          <div className="lg:hidden">
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col bg-surface px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-lift"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <div className="flex items-center justify-between px-1">
                <Logo href="/dashboard" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-edge"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="mt-6 flex-1 overflow-y-auto" aria-label="Main">
                <NavList onNavigate={() => setOpen(false)} />
              </nav>
              <UpgradeCard />
              <div className="mt-4 flex items-center justify-between px-1 text-[13px] text-muted">
                Appearance
                <ThemeToggle />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
