import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Brand name is env-driven (D27); real metadata ships with the public surface.
  title: process.env.BRAND_NAME ?? "Portal (dev)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
