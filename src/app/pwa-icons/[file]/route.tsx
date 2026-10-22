import { ImageResponse } from "next/og";

const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-180.png": { size: 180, maskable: true },
};

/** App icons drawn from the brand mark (stacked floor slabs on amber). */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const spec = SIZES[(await params).file];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, maskable } = spec;
  // Maskable icons keep the mark inside the central safe zone.
  const mark = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#c97a1e", borderRadius: maskable ? 0 : size * 0.22 }}>
        <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round">
          <path d="M5 19h14" />
          <path d="M7 14.5h10" />
          <path d="M9 10h6" />
          <path d="M11 5.5h2" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
