"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

const links = [
  { href: "/", label: "Play" },
  { href: "/profile", label: "Profile" }
];

export function Navbar() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <nav className="flex items-center justify-between rounded-lg border border-white/25 bg-black px-4 py-3">
      <div className="text-lg font-semibold tracking-wide text-white">Key Strike</div>
      <div className="flex items-center gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900 hover:text-white"
          >
            {link.label}
          </Link>
        ))}

        {isLoaded && isSignedIn ? (
          <UserButton />
        ) : (
          <>
            <SignInButton mode="modal">
              <button className="rounded-md border border-white/25 px-3 py-1.5 text-sm text-zinc-100 hover:border-white/60">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md border border-white/25 px-3 py-1.5 text-sm text-zinc-100 hover:border-white/60">
                Sign Up
              </button>
            </SignUpButton>
          </>
        )}
      </div>
    </nav>
  );
}
