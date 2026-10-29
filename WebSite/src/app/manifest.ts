import type { MetadataRoute } from "next";
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vinili & Caffè • Italia • Social • Gaming",
    short_name: "Vinili & Caffè • Italia • Social • Gaming",
    description: "Community Discord Italiana.",
    id: "/?app=vinili-caffe-react1",
    start_url: "/?app=vinili-caffe-react1",
    display: "standalone",
    background_color: "#0e0906",
    theme_color: "#0e0906",
    lang: "it",
    related_applications: [
      {
        platform: "webapp",
        url: "https://www.viniliecaffe.it/manifest.webmanifest",
      },
    ],
    prefer_related_applications: false,
    icons: [
      {
        src: "/images/pwa-icon-192.png?v=20261029logo1",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/pwa-icon-512.png?v=20261029logo1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/pwa-icon-192-maskable.png?v=20261029logo1",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/images/pwa-icon-512-maskable.png?v=20261029logo1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
