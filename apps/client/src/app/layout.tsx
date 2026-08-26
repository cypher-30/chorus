import { PostHogProvider } from "@/components/PostHogProvider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import TQProvider from "@/components/TQProvider";
import { Providers } from "@/components/Providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chorus",
  description:
    "Chorus is an open-source, web audio player built for multi-device playback.",
  keywords: ["music", "sync", "audio", "collaboration", "real-time"],
  authors: [{ name: "Chorus" }],
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={cn(
          inter.variable,
          spaceGrotesk.variable,
          ibmPlexMono.variable,
          "antialiased font-sans dark selection:bg-primary-800 selection:text-white"
        )}
      >
        <PostHogProvider>
          <TQProvider>
            <Providers>{children}</Providers>
            <Toaster />
            <Analytics />
          </TQProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
