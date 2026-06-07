import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Commerce Agent Admin",
  description: "Admin dashboard for product, inventory, order, and AI conversation management."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

