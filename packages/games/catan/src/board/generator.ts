import type { RngState, SeededRNG } from "@gaming-platform/core";
import type { CatanConfig } from "../types/domain.ts";
import {
  generateCitiesAndKnights56BoardPure,
  generateCitiesAndKnightsBoardPure,
} from "./cities-knights-boards.ts";
import type { GeneratedBoard } from "./helpers.ts";
import {
  generateSeafarersFogIslands56BoardPure,
  generateSeafarersFogIslandsBoardPure,
} from "./seafarers-fog.ts";
import {
  generateSeafarersFourIslandsBoardPure,
  generateSeafarersSixIslands56BoardPure,
} from "./seafarers-islands.ts";
import {
  generateSeafarersNewShores56BoardPure,
  generateSeafarersNewShoresBoardPure,
} from "./seafarers-shores.ts";
import {
  generateBigIslandBoardPure,
  generateStandardBoardPure,
} from "./standard-boards.ts";

export function generateCatanBoardPure(
  config: CatanConfig,
  rngState: RngState
): readonly [GeneratedBoard, RngState] {
  const use56 = Boolean(config.enable56PlayerExtension);
  switch (config.scenarioId) {
    case "big_island_5_6":
      return generateBigIslandBoardPure(config, rngState);
    case "cities_and_knights_5_6":
      return generateCitiesAndKnights56BoardPure(config, rngState);
    case "seafarers_new_shores_5_6":
      return generateSeafarersNewShores56BoardPure(config, rngState);
    case "seafarers_six_islands_5_6":
      return generateSeafarersSixIslands56BoardPure(config, rngState);
    case "seafarers_fog_islands_5_6":
      return generateSeafarersFogIslands56BoardPure(config, rngState);
    case "seafarers_new_shores":
      return use56
        ? generateSeafarersNewShores56BoardPure(config, rngState)
        : generateSeafarersNewShoresBoardPure(config, rngState);
    case "seafarers_four_islands":
      return use56
        ? generateSeafarersSixIslands56BoardPure(config, rngState)
        : generateSeafarersFourIslandsBoardPure(config, rngState);
    case "seafarers_fog_islands":
      return use56
        ? generateSeafarersFogIslands56BoardPure(config, rngState)
        : generateSeafarersFogIslandsBoardPure(config, rngState);
    case "cities_and_knights":
      return generateCitiesAndKnightsBoardPure(config, rngState);
    case "standard":
    default:
      return use56
        ? generateBigIslandBoardPure(config, rngState)
        : generateStandardBoardPure(config, rngState);
  }
}

export function generateCatanBoard(
  config: CatanConfig,
  rng: SeededRNG
): GeneratedBoard {
  const [board, nextState] = generateCatanBoardPure(config, rng.getState());
  while (rng.getState() !== nextState) {
    rng.nextFloat();
  }
  return board;
}
