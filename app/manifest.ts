import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "관재 AI 출동관리",
    short_name: "관재출동",
    description: "관재처 물품 불용/반납 출동관리 시스템",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef0f8",
    theme_color: "#eef0f8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
