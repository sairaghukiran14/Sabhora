import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { MobileNav, Sidebar } from "@/components/app/AppNav";
import UserArea, { UserAreaSkeleton } from "@/components/app/UserArea";

export const metadata: Metadata = { title: "Dashboard · Sabhora" };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg lg:pl-64">
      <Sidebar />
      <header className="sticky top-0 z-30 border-b border-edge bg-bg/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:justify-end lg:px-10">
          <Suspense fallback={<span className="h-9 w-9 lg:hidden" />}>
            <MobileNav />
          </Suspense>
          <Suspense fallback={<UserAreaSkeleton />}>
            <UserArea />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10">{children}</main>
    </div>
  );
}
