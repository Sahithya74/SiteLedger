import Link from "next/link";
import { Bell } from "lucide-react";

/** Header bell: count of open reminders not yet read plus engineer tasks still to remind today. */
export function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={count ? `Notifications (${count} new)` : "Notifications"}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="tabular absolute -top-0.5 -right-0.5 min-w-4.5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4.5 font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
