import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppFooter, AppHeader } from "@/components/app-header";
import { getRuntimeConfig } from "@/server/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Studio Operator",
    template: "%s · Studio Operator",
  },
  description: "Internal production desk for a one-person creative studio.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const config = getRuntimeConfig();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppHeader
          mode={config.mode}
          model={config.analysisModel}
          analysisProvider={config.analysisProvider}
        />
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
