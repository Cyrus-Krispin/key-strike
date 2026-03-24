"use client";

import { useEffect, useState } from "react";
import { getProfile, type Profile } from "@/lib/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getProfile()
      .then((data) => {
        if (mounted) {
          setProfile(data);
        }
      })
      .catch(() => {
        if (mounted) {
          setError("Unable to load profile from API.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-6">
      <h1 className="text-2xl font-semibold text-slate-100">Profile</h1>
      <p className="mt-2 text-sm text-slate-400">Data source: /api/profile</p>

      {error && <p className="mt-6 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">{error}</p>}

      {!error && !profile && <p className="mt-6 text-slate-300">Loading profile...</p>}

      {profile && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Card label="Username" value={profile.username} />
          <Card label="Level" value={String(profile.level)} />
          <Card label="Wins" value={String(profile.wins)} />
          <Card label="Losses" value={String(profile.losses)} />
        </div>
      )}
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}
