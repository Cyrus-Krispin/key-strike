# Game Rules v1

## Match Flow

1. Players enter a room.
2. Match starts with a short countdown.
3. Match is active while both players have health above zero.
4. Match ends when one player's health reaches zero.

## Sentence Flow (Monkeytype-style)

- One shared sentence is active for both players.
- The sentence stays fixed on screen (no auto movement).
- Progress advances only when correct input is typed.
- A new sentence is generated immediately after one player clears the current sentence.
- Mistyped characters still advance the cursor and are shown as errors.
- Backspace can move the cursor back and correct the most recent entries.
- A visible caret shows the current typing position.

## Input Judgments

- Correct character:
  - Advances cursor by 1.
  - Builds combo.
  - Grants a small amount of energy.
- Mistype:
  - Resets combo.
  - Applies small self-damage.
  - Reduces energy slightly.

## Damage Rules (v1)

- Completing a sentence deals damage to the opponent.
- Damage scales with combo, capped to avoid spikes.
- Timeout applies a smaller penalty to both players based on remaining characters.

## v1 Scope

- 1v1 only.
- Deterministic state transitions.
- Local prototype supports:
  - Human player input.
  - Simulated enemy typing.
  - Real win/lose condition.

## Deferred (next iterations)

- Latency-aware multiplayer synchronization.
- More nuanced tie-break behavior.
- Ability effects integrated into engine.
- Difficulty tiers and adaptive sentence generation.
