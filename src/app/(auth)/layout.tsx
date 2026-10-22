import { BrandMark, BrandName } from "@/components/app/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--color-brand-soft),_transparent_60%)] px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <BrandMark className="size-10" />
        <BrandName subtitle="Construction operations & accounts" />
      </div>
      <div className="page-enter w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-xs text-muted-foreground">Private system · authorised users only</p>
    </div>
  );
}
