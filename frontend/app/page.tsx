import Link from "next/link";

export default function HomePage() {
  return (
    <section className="rounded-xl border border-white/25 bg-black p-8 shadow-xl shadow-black/30">
      <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Key Strike</p>
      <h1 className="mt-3 text-4xl font-bold text-zinc-100">Train your typing. Win battles.</h1>
      <p className="mt-4 max-w-2xl text-zinc-300">
        This starter monorepo includes a Next.js frontend and a Go backend for a multiplayer typing game.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          className="rounded-md border border-white/40 bg-zinc-950 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-900"
          href="/play"
        >
          Play
        </Link>
        <Link className="rounded-md border border-white/20 px-4 py-2 font-medium text-zinc-200 hover:bg-zinc-900" href="/profile">
          Profile
        </Link>
      </div>
    </section>
  );
}
