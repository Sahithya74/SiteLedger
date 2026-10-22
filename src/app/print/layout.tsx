/** Print views: no sidebar or header, just the paper. Each page checks access itself. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-stone-100 print:bg-white">{children}</div>;
}
