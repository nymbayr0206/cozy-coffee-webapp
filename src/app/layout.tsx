import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cozy Coffee Kass",
  description: "Odoo ERP-тэй холбогдсон кассын веб систем",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon-32.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
