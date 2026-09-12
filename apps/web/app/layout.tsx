import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { WorldProvider } from "../components/world-provider";

export const metadata: Metadata = {
  title: "Cities Through Time",
  description: "Walk any city as it looked in any decade — an explorable world model.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorldProvider>{children}</WorldProvider>
      </body>
    </html>
  );
}
