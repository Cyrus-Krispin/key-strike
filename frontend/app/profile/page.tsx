"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getProfile, type Profile } from "@/lib/api";

export default function ProfilePage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let mounted = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Missing auth token");
        }
        const data = await getProfile(token);
        if (mounted) {
          setProfile(data);
        }
      } catch {
        if (mounted) {
          setError("Unable to load profile from API.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <section className="rounded-xl border border-white/25 bg-black p-6">
      <h1 className="text-2xl font-semibold text-zinc-100">Profile</h1>
      <p className="mt-2 text-sm text-zinc-400">Data source: /api/profile</p>

      {error && <p className="mt-6 rounded-md border border-white/30 bg-zinc-950 p-3 text-zinc-200">{error}</p>}

      {!error && !profile && <p className="mt-6 text-zinc-300">Loading profile...</p>}

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
    <div className="rounded-lg border border-white/20 bg-black p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
