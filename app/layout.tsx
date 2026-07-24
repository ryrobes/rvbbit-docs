import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  metadataBase: new URL("https://rvbbit.ai"),
  title: {
    default: "RVBBIT",
    template: "%s | RVBBIT"
  },
  description:
    "RVBBIT documentation for semantic SQL, storage acceleration, routing, and operational workflows."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GoogleAnalytics />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
