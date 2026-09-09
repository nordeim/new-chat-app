import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kimi — A little more possible",
  description:
    "A thoughtful space to write, build, and follow your curiosity. Chat with Kimi K3, powered by NVIDIA NIM.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
