import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import "./globals.css";

// next/font descarga la fuente en BUILD y la sirve self-hosted (sin CDN).
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return {
    title: {
      default: `${branding.name} CRM — Plataforma de Ventas y Prospección Inteligente`,
      template: `%s | ${branding.name} CRM`,
    },
    description: "LocalRank CRM es la plataforma todo-en-uno para equipos de ventas: prospección con IA, pipeline visual, conversaciones omnicanal (WhatsApp, Email, Instagram, LinkedIn, Telegram), propuestas profesionales, analytics avanzados y automatización. Cierra más deals en menos tiempo.",
    keywords: ["CRM", "ventas", "prospección", "WhatsApp Business", "pipeline", "leads", "inteligencia artificial", "automatización", "omnicanal", "LocalRank"],
    authors: [{ name: "LocalRank" }],
    creator: "LocalRank",
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    openGraph: {
      type: "website",
      locale: "es_CO",
      siteName: "LocalRank CRM",
      title: "LocalRank CRM — Plataforma de Ventas y Prospección Inteligente",
      description: "CRM todo-en-uno: prospección IA, pipeline visual, omnicanal, propuestas, analytics. Cierra más deals en menos tiempo.",
    },
    twitter: {
      card: "summary_large_image",
      title: "LocalRank CRM",
      description: "Plataforma de ventas y prospección inteligente con IA, omnicanal y pipeline visual.",
    },
    manifest: "/manifest.webmanifest",
    themeColor: "#0a6cff",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return (
    <html lang="es" className={geist.variable}>
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
      </head>
      <body className="font-sans" spellCheck>{children}</body>
    </html>
  );
}
