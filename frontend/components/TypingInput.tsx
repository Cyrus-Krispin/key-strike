"use client";

import { useMemo, useState } from "react";

type TypingInputProps = {
  promptText: string;
};

export function TypingInput({ promptText }: TypingInputProps) {
  const [value, setValue] = useState("");

  const progress = useMemo(() => {
    if (!promptText.length) return 0;
    const ratio = value.length / promptText.length;
    return Math.max(0, Math.min(100, Math.floor(ratio * 100)));
  }, [value.length, promptText.length]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-sm text-slate-300">{promptText}</p>
      <input
        aria-label="Typing input"
        className="mt-4 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-400/70 placeholder:text-slate-500 focus:ring"
        placeholder="Type to attack..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
