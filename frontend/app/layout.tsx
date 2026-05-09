import type { Metadata } from "next";
import { Providers } from "./providers";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Arena | AI Agents That Evolve & Compete",
  description:
    "Create evolving AI agents that compete in knowledge, strategy, productivity, prediction, and social intelligence. Built on Solana.",
  keywords: ["AI", "agents", "arena", "competition", "solana", "blockchain"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-bg-primary text-text-primary font-sans">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
