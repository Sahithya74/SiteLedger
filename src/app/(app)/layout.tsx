import { Suspense } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { GlobalSearch } from "@/components/shell/global-search";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserMenu } from "@/components/shell/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel } from "@/lib/labels";
import { navigationFor } from "@/lib/navigation";
import { requireUser } from "@/server/auth/current-user";
import { taskReminderSuggestions, unreadCount } from "@/server/services/notifications";
import { companyName } from "@/server/services/users";

/**
 * The signed-in shell. The frame renders immediately; the parts that depend
 * on who is logged in (menu, name) stream in behind Suspense boundaries.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<SidebarFallback />}>
        <SidebarForUser />
      </Suspense>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="size-9" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="flex min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <HeaderUser />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function SidebarForUser() {
  // Read the session first: it marks this part as per-request before any database work.
  const user = await requireUser();
  const company = await companyName();
  return <AppSidebar sections={navigationFor(user)} companyName={company} />;
}

async function HeaderUser() {
  const user = await requireUser();
  const [unread, tasks] = await Promise.all([unreadCount(user), taskReminderSuggestions(user)]);
  return (
    <div className="flex items-center gap-1">
      <NotificationBell count={unread + tasks.filter((t) => !t.sentToday).length} />
      <UserMenu name={user.name} roleLabel={roleLabel(user.role)} isOwner={user.role === "ADMIN"} />
    </div>
  );
}

function SidebarFallback() {
  return <div className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block" />;
}
