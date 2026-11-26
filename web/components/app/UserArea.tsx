import NextLink from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { Coins, Plus } from "../icons";
import { btn } from "../ui";
import UserMenu from "./UserMenu";

/** Reads the session, so it always renders inside a <Suspense> boundary. */
export default async function UserArea() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <NextLink href="/dashboard/new" className={btn("brand", "sm", "max-sm:hidden lg:hidden")}>
        <Plus size={16} /> New run
      </NextLink>
      <NextLink
        href="/dashboard/billing"
        className="flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-edge-strong"
        aria-label={`${user.balance} credits. Go to billing`}
      >
        <Coins size={16} className="text-accent-ink" />
        <span className="tabular-nums">{user.balance}</span>
        <span className="hidden text-muted sm:inline">credits</span>
      </NextLink>
      <UserMenu name={user.name} email={user.email} />
    </div>
  );
}

export function UserAreaSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-8 w-24 animate-pulse rounded-full bg-edge" />
      <span className="h-9 w-9 animate-pulse rounded-full bg-edge" />
    </div>
  );
}
