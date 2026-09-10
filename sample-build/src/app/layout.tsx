import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kimi — A little more possible",
  description:
    "A thoughtful space to write, build, and follow your curiosity. Chat with Kimi K3, powered by NVIDIA NIM.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#306345",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
