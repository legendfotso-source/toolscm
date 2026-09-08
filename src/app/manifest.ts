import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tools.cm — Outils PDF et image",
    short_name: "Tools.cm",
    description:
      "Compressez, fusionnez et convertissez vos fichiers PDF et images directement sur votre appareil.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6D28D9",
    lang: "fr",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
