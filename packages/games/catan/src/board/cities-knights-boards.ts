import type { RngState } from "@gaming-platform/core";
import type { CatanConfig } from "../types/domain.ts";
import type { GeneratedBoard } from "./helpers.ts";
import {
  generateBigIslandBoardPure,
  generateStandardBoardPure,
} from "./standard-boards.ts";

export function generateCitiesAndKnightsBoardPure(
  config: CatanConfig,
  rngState: RngState
): readonly [GeneratedBoard, RngState] {
  return Boolean(config.enable56PlayerExtension)
    ? generateBigIslandBoardPure(config, rngState)
    : generateStandardBoardPure(config, rngState);
}

export function generateCitiesAndKnights56BoardPure(
  config: CatanConfig,
  rngState: RngState
): readonly [GeneratedBoard, RngState] {
  return generateBigIslandBoardPure(config, rngState);
}
