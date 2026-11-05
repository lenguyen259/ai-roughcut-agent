import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Roughcut Agent",
  description:
    "On-device rough cut for transcripts: silence, fillers, semantic B-roll, kinetic captions, 9:16 reframe, and a CMX3600 EDL. No paid APIs.",
};

export const viewport: Viewport = {
  themeColor: "#070706",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
