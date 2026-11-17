import type { AzulAction, AzulState } from "../types.ts";
import { TARGET_LINES, canPlaceColorOnPatternLine } from "./helpers.ts";

export function getAzulLegalActions(
  state: AzulState,
  playerId: string
): AzulAction[] {
  if (state.phase === "GAME_OVER") return [];
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (activePlayer.id !== playerId) return [];

  const factoryActions: AzulAction[] = state.factories.flatMap(
    (factory, fIdx) => {
      if (factory.length === 0) return [];
      const distinctColors = Array.from(new Set(factory));
      return distinctColors.flatMap((color) =>
        TARGET_LINES.filter(
          (targetLine) =>
            targetLine === "floor" ||
            canPlaceColorOnPatternLine(activePlayer, targetLine, color)
        ).map(
          (targetLine): AzulAction => ({
            type: "DRAFT_TILES",
            source: { kind: "factory", factoryIndex: fIdx },
            color,
            targetLine,
          })
        )
      );
    }
  );

  const centerActions: AzulAction[] =
    state.centerPool.length > 0
      ? Array.from(new Set(state.centerPool)).flatMap((color) =>
          TARGET_LINES.filter(
            (targetLine) =>
              targetLine === "floor" ||
              canPlaceColorOnPatternLine(activePlayer, targetLine, color)
          ).map(
            (targetLine): AzulAction => ({
              type: "DRAFT_TILES",
              source: { kind: "center" },
              color,
              targetLine,
            })
          )
        )
      : [];

  return [...factoryActions, ...centerActions];
}
