import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/play", label: "Play" },
  { href: "/profile", label: "Profile" }
];

export function Navbar() {
  return (
    <nav className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/80 px-4 py-3">
      <div className="text-lg font-semibold tracking-wide text-cyan-300">Key Strike</div>
      <div className="flex gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-cyan-300"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
