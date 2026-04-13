import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrightDesk — Sunflower Early Learning",
  description:
    "BrightDesk for Sunflower Early Learning. Answers parent questions instantly from the Family Handbook and escalates to staff when uncertain.",
  // Prototype deployed to a public URL for demo purposes only —
  // explicitly opt out of search indexing. robots.txt under
  // /public says the same thing for crawlers that read it first.
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
