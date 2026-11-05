import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roughcut Agent",
  description:
    "On-device rough cut for transcripts: silence, fillers, semantic B-roll, kinetic captions, 9:16 reframe, and a CMX3600 EDL. No paid APIs.",
};

export const viewport: Viewport = {
  themeColor: "#0c0b0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
