import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certify — verifiable certificates",
  description: "Create, batch-generate and verify beautiful certificates."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
