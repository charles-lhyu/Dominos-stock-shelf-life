import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { RegisterSW } from "@/components/register-sw";
import { withBasePath } from "@/lib/base-path";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Domino's Stock Shelf Life",
  title: "Domino's Stock Shelf Life",
  description:
    "Domino's stock shelf life chart. Type a product, then enter the delivery or pack date to see the use-by date.",
  // Absolute (basePath) hrefs — relative public/manifest icons failed to show on some installs.
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Domino's Shelf Life",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      {
        url: `${withBasePath("/icons/icon-192.png")}?v=20261024`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: `${withBasePath("/icons/icon-512.png")}?v=20261024`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: `${withBasePath("/icons/apple-touch-icon.png")}?v=20261024`,
        sizes: "180x180",
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1624",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${sans.variable} ${mono.variable} ${display.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <ThemeProvider forcedTheme="dark" attribute="class" enableSystem={false}>
          {children}
          <RegisterSW />
        </ThemeProvider>
      </body>
    </html>
  );
}
