"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Arrow } from "../icons";
import { btn } from "../ui";

/** Mobile-only conversion bar: appears after the hero, hides near the final CTA. */
export default function StickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Measured on scroll: an IntersectionObserver misses jumps that skip right past the marker.
    const update = () => {
      const hero = document.getElementById("hero-end");
      const final = document.getElementById("final-cta");
      if (!hero) return;
      const pastHero = hero.getBoundingClientRect().top < 0;
      const atFinal = !!final && final.getBoundingClientRect().top < window.innerHeight;
      setShow(pastHero && !atFinal);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-bg/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg md:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Test your idea free</p>
              <p className="truncate text-xs text-muted">50 credits · no card</p>
            </div>
            <NextLink href="/signup" className={btn("brand", "md")}>
              Start free <Arrow size={16} />
            </NextLink>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
