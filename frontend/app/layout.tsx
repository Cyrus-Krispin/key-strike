import type { Metadata } from "next";
import { VT323 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Key Strike",
  description: "Multiplayer typing battle game"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={vt323.className}>
        <ClerkProvider>
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5">
            <Navbar />
            <main className="mt-6 flex-1">{children}</main>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
