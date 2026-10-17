import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/locales";
import { Providers } from "./providers";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HaqCheck",
  description: "Understand your payment. Check a possible mistake. Prepare your complaint with evidence.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f665d",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : "en";
  return (
    <html lang={locale} className={`${inter.variable} ${devanagari.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers initialLocale={locale}>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
