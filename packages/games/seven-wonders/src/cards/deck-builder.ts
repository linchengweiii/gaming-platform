import { shufflePure } from "@gaming-platform/core";
import { SEVEN_WONDERS_EXTRA_GUILDS_OVER_PLAYER_COUNT } from "../config/game-config.ts";
import type { SevenWondersAge, SevenWondersCard } from "../types.ts";
import { SEVEN_WONDERS_AGE_I_CARDS } from "./age1.ts";
import { SEVEN_WONDERS_AGE_II_CARDS } from "./age2.ts";
import { SEVEN_WONDERS_AGE_III_BASE_CARDS } from "./age3.ts";
import { SEVEN_WONDERS_GUILD_CARDS } from "./guilds.ts";

export function buildAgeDeckPure(
  rngState: number,
  age: SevenWondersAge,
  playerCount: number
): { readonly deck: SevenWondersCard[]; readonly rngState: number } {
  if (age === 1) {
    const filtered = SEVEN_WONDERS_AGE_I_CARDS.filter(
      (c) => c.minPlayers <= playerCount
    );
    const [shuffled, nextRng] = shufflePure(rngState, filtered);
    return { deck: shuffled, rngState: nextRng };
  }
  if (age === 2) {
    const filtered = SEVEN_WONDERS_AGE_II_CARDS.filter(
      (c) => c.minPlayers <= playerCount
    );
    const [shuffled, nextRng] = shufflePure(rngState, filtered);
    return { deck: shuffled, rngState: nextRng };
  }

  const base = SEVEN_WONDERS_AGE_III_BASE_CARDS.filter(
    (c) => c.minPlayers <= playerCount
  );
  const [shuffledGuilds, rngAfterGuilds] = shufflePure(
    rngState,
    SEVEN_WONDERS_GUILD_CARDS
  );
  const selectedGuilds = shuffledGuilds.slice(
    0,
    playerCount + SEVEN_WONDERS_EXTRA_GUILDS_OVER_PLAYER_COUNT
  );
  const combined = [...base, ...selectedGuilds];
  const [shuffledAge3, rngAfterAge3] = shufflePure(rngAfterGuilds, combined);
  return { deck: shuffledAge3, rngState: rngAfterAge3 };
}
