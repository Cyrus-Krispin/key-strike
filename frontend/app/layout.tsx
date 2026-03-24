import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Key Strike",
  description: "Multiplayer typing battle game"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5">
          <Navbar />
          <main className="mt-6 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
