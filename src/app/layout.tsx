import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeaseDesk",
  description: "Tenant records, renewal alerts & instant default notices",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-ZA"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
