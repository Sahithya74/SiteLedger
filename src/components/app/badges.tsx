import type { Priority, ProjectStatus, WorkStatus } from "@/generated/prisma/enums";
import { PRIORITY, PROJECT_STATUS, TONE_CLASSES, WORK_STATUS, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function ToneBadge({
  tone,
  children,
  className,
  dot = true,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[tone].badge,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} />}
      {children}
    </span>
  );
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const s = PROJECT_STATUS[status];
  return (
    <ToneBadge tone={s.tone} className={className}>
      {s.label}
    </ToneBadge>
  );
}

export function WorkStatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  const s = WORK_STATUS[status];
  return (
    <ToneBadge tone={s.tone} className={className}>
      {s.label}
    </ToneBadge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const p = PRIORITY[priority];
  return (
    <ToneBadge tone={p.tone} className={className} dot={false}>
      {p.label}
    </ToneBadge>
  );
}
