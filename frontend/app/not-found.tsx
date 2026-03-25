import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="rounded-xl border border-white/25 bg-black p-8 shadow-xl shadow-black/30">
      <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">404</p>
      <h1 className="mt-3 text-3xl font-bold text-zinc-100">Page not found</h1>
      <p className="mt-4 text-zinc-300">The page you are looking for does not exist.</p>
      <Link
        className="mt-6 inline-flex rounded-md border border-white/40 bg-zinc-950 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-900"
        href="/"
      >
        Back to Home
      </Link>
    </section>
  );
}
