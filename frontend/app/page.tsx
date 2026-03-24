import Link from "next/link";

export default function HomePage() {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-8 shadow-xl shadow-black/30">
      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Key Strike</p>
      <h1 className="mt-3 text-4xl font-bold text-slate-100">Train your typing. Win battles.</h1>
      <p className="mt-4 max-w-2xl text-slate-300">
        This starter monorepo includes a Next.js frontend and a Go backend for a multiplayer typing game.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          className="rounded-md border border-cyan-400/70 bg-cyan-500/15 px-4 py-2 font-medium text-cyan-300 hover:bg-cyan-500/25"
          href="/play"
        >
          Play
        </Link>
        <Link className="rounded-md border border-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800" href="/profile">
          Profile
        </Link>
      </div>
    </section>
  );
}
