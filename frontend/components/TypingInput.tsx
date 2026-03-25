"use client";

type TypingInputProps = {
  promptText: string;
  progress: number;
  onTypeChar: (char: string) => void;
  onBackspace?: () => void;
  disabled?: boolean;
  helperText?: string;
};

export function TypingInput({
  promptText,
  progress,
  onTypeChar,
  onBackspace,
  disabled = false,
  helperText
}: TypingInputProps) {
  return (
    <div className="rounded-lg border border-white/25 bg-black p-4">
      <p className="text-sm text-zinc-200">{promptText}</p>
      <input
        aria-label="Typing input"
        autoFocus
        className="mt-4 w-full rounded-md border border-white/30 bg-black px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/60"
        disabled={disabled}
        placeholder="Type to attack..."
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          if (disabled) return;
          if (event.key === "Backspace") {
            event.preventDefault();
            onBackspace?.();
            return;
          }
          if (event.key.length !== 1) return;
          event.preventDefault();
          onTypeChar(event.key);
        }}
      />
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-300">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>
      {helperText && <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">{helperText}</p>}
      <div className="mt-2 h-2 rounded-full bg-zinc-900">
        <div className="h-2 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
