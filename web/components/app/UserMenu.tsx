"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { logout } from "@/app/actions/auth";
import { Card, ChevronDown, LogOut, Settings, User } from "../icons";
import { Initials } from "../ui";

export default function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-ink/5"
      >
        <Initials name={name} className="h-9 w-9 text-[13px]" />
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-edge bg-raised p-1.5 shadow-lift"
          >
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-[13px] text-muted">{email}</p>
            </div>
            <div className="my-1 h-px bg-edge" />
            <NextLink href="/dashboard/profile" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <User size={17} /> Profile
            </NextLink>
            <NextLink href="/dashboard/settings" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <Settings size={17} /> Settings
            </NextLink>
            <NextLink href="/dashboard/billing" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <Card size={17} /> Credits &amp; billing
            </NextLink>
            <div className="my-1 h-px bg-edge" />
            <form action={logout}>
              <button type="submit" className={item} role="menuitem">
                <LogOut size={17} /> Log out
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
