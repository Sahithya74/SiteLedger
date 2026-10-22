import type { MetadataRoute } from "next";

/** Lets SITECORE be installed on phones and desktops ("Add to Home screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SITECORE — Construction operations",
    short_name: "SITECORE",
    description: "Projects, materials, labour and accounts for your construction business.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f5f2",
    theme_color: "#2b2724",
    lang: "en-IN",
    icons: [
      { src: "/pwa-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mark attendance", url: "/labour/attendance" },
      { name: "Daily report", url: "/daily-reports/new" },
      { name: "Record expense", url: "/accounts/expenses" },
    ],
  };
}
