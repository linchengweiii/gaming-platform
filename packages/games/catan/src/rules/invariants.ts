import type { InvariantCheckResult } from "@gaming-platform/core";
import {
  CK_THRESHOLDS,
  PROGRESS_CARD_CATALOG,
} from "../config/cities-knights-config.ts";
import {
  BANK_LIMITS,
  DEFAULT_PIECE_LIMITS,
} from "../config/costs-and-limits.ts";
import {
  COMMODITIES,
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
} from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { getPlayerResourceCount, isExpanded56State } from "./helpers.ts";

/**
 * Verifies domain invariants on `state` to catch any state corruption or rule bug immediately.
 */
export function checkCatanInvariants(state: CatanState): InvariantCheckResult {
  const isExpanded = isExpanded56State(state);
  const expectedTotalPerResource = isExpanded
    ? BANK_LIMITS.expandedPerResource
    : BANK_LIMITS.standardPerResource;
  const expectedTotalPerCommodity = isExpanded
    ? BANK_LIMITS.expandedPerCommodity
    : BANK_LIMITS.standardPerCommodity;
  const hasRedactedHands = state.players.some((p) => p.handRedacted);

  // 1. Non-negative bank & player resources/commodities + total conservation
  const resourceViolations: string[] = hasRedactedHands
    ? (() => {
        const bankNegViolations = RESOURCES.filter((r) => state.bank[r] < 0).map(
          (r) => `Bank has negative ${r}: ${state.bank[r]}`
        );
        const commNegViolations = state.config.enableCitiesAndKnights
          ? COMMODITIES.filter((c) => state.commodityBank[c] < 0).map(
              (c) => `Commodity bank has negative ${c}: ${state.commodityBank[c]}`
            )
          : [];
        const bankSum = RESOURCES.reduce<number>(
          (s, r) => s + state.bank[r],
          0
        );
        const commBankSum = state.config.enableCitiesAndKnights
          ? COMMODITIES.reduce<number>((s, c) => s + state.commodityBank[c], 0)
          : 0;
        const playerNegViolations = state.players
          .map((p) => ({ id: p.id, count: getPlayerResourceCount(p) }))
          .filter((x) => x.count < 0)
          .map((x) => `Player ${x.id} has negative card count: ${x.count}`);
        const playerCardSum = state.players.reduce<number>(
          (s, p) => s + getPlayerResourceCount(p),
          0
        );
        const expectedGrandTotal =
          expectedTotalPerResource * RESOURCES.length +
          (state.config.enableCitiesAndKnights
            ? expectedTotalPerCommodity * COMMODITIES.length
            : 0);
        const conservationViolations =
          bankSum + commBankSum + playerCardSum !== expectedGrandTotal
            ? [
                `Aggregate card conservation violated: bank(${bankSum + commBankSum}) + players(${playerCardSum}) !== ${expectedGrandTotal}`,
              ]
            : [];
        return [
          ...bankNegViolations,
          ...commNegViolations,
          ...playerNegViolations,
          ...conservationViolations,
        ];
      })()
    : [
        ...RESOURCES.flatMap((r) => {
          const bankNeg =
            state.bank[r] < 0 ? [`Bank has negative ${r}: ${state.bank[r]}`] : [];
          const playerNeg = state.players
            .filter((p) => p.resources[r] < 0)
            .map((p) => `Player ${p.id} has negative ${r}: ${p.resources[r]}`);
          const playerSum = state.players.reduce<number>(
            (s, p) => s + p.resources[r],
            0
          );
          const conservation =
            state.bank[r] + playerSum !== expectedTotalPerResource
              ? [
                  `Resource conservation violated for ${r}: bank(${state.bank[r]}) + players(${playerSum}) !== ${expectedTotalPerResource}`,
                ]
              : [];
          return [...bankNeg, ...playerNeg, ...conservation];
        }),
        ...(state.config.enableCitiesAndKnights
          ? COMMODITIES.flatMap((c) => {
              const bankNeg =
                state.commodityBank[c] < 0
                  ? [
                      `Commodity bank has negative ${c}: ${state.commodityBank[c]}`,
                    ]
                  : [];
              const playerNeg = state.players
                .filter((p) => p.commodities[c] < 0)
                .map(
                  (p) => `Player ${p.id} has negative ${c}: ${p.commodities[c]}`
                );
              const playerSum = state.players.reduce<number>(
                (s, p) => s + p.commodities[c],
                0
              );
              const conservation =
                state.commodityBank[c] + playerSum !== expectedTotalPerCommodity
                  ? [
                      `Commodity conservation violated for ${c}: bank(${state.commodityBank[c]}) + players(${playerSum}) !== ${expectedTotalPerCommodity}`,
                    ]
                  : [];
              return [...bankNeg, ...playerNeg, ...conservation];
            })
          : []),
      ];

  // 2. Distance Rule on all buildings + Knight/Building mutual exclusion
  const distanceViolations: string[] = [
    ...Object.entries(state.buildings).flatMap(([vId, b]) => {
      const vNode = state.topology.vertices[vId];
      if (!vNode) {
        return [`Building placed on non-existent vertex ${vId}`];
      }
      return vNode.adjacentVertexIds
        .filter((adjVId) => Boolean(state.buildings[adjVId]))
        .map(
          (adjVId) =>
            `Distance rule violated: adjacent buildings at ${vId} (${b.ownerId}) and ${adjVId} (${state.buildings[adjVId]!.ownerId})`
        );
    }),
    ...Object.keys(state.knights)
      .filter((vId) => Boolean(state.buildings[vId]))
      .map((vId) => `Vertex ${vId} has both a building and a knight`),
  ];

  // 3. Piece supply counts match board pieces (including borrowedCityPiece & Knights)
  const pieceViolations: string[] = state.players.flatMap((p) => {
    const regularSettlementsOnBoard = Object.values(state.buildings).filter(
      (b) => b.ownerId === p.id && b.type === "settlement" && !b.borrowedCityPiece
    ).length;
    const borrowedCitySettlementsOnBoard = Object.values(state.buildings).filter(
      (b) =>
        b.ownerId === p.id &&
        b.type === "settlement" &&
        Boolean(b.borrowedCityPiece)
    ).length;
    const citiesOnBoard = Object.values(state.buildings).filter(
      (b) => b.ownerId === p.id && b.type === "city"
    ).length;
    const roadsOnBoard = Object.values(state.edges).filter(
      (e) => e.ownerId === p.id && e.type === "road"
    ).length;
    const shipsOnBoard = Object.values(state.edges).filter(
      (e) => e.ownerId === p.id && e.type === "ship"
    ).length;
    const basicKnightsOnBoard = Object.values(state.knights).filter(
      (k) => k.ownerId === p.id && k.level === 1
    ).length;
    const strongKnightsOnBoard = Object.values(state.knights).filter(
      (k) => k.ownerId === p.id && k.level === 2
    ).length;
    const mightyKnightsOnBoard = Object.values(state.knights).filter(
      (k) => k.ownerId === p.id && k.level === 3
    ).length;

    return [
      ...(regularSettlementsOnBoard + p.settlementsRemaining !==
      DEFAULT_PIECE_LIMITS.settlements
        ? [
            `Player ${p.id} settlement count mismatch: ${regularSettlementsOnBoard} + ${p.settlementsRemaining} !== ${DEFAULT_PIECE_LIMITS.settlements}`,
          ]
        : []),
      ...(citiesOnBoard + borrowedCitySettlementsOnBoard + p.citiesRemaining !==
      DEFAULT_PIECE_LIMITS.cities
        ? [
            `Player ${p.id} city count mismatch: ${citiesOnBoard} + borrowed(${borrowedCitySettlementsOnBoard}) + ${p.citiesRemaining} !== ${DEFAULT_PIECE_LIMITS.cities}`,
          ]
        : []),
      ...(roadsOnBoard + p.roadsRemaining !== DEFAULT_PIECE_LIMITS.roads
        ? [
            `Player ${p.id} road count mismatch: ${roadsOnBoard} + ${p.roadsRemaining} !== ${DEFAULT_PIECE_LIMITS.roads}`,
          ]
        : []),
      ...(state.config.enableSeafarers &&
      shipsOnBoard + p.shipsRemaining !== DEFAULT_PIECE_LIMITS.ships
        ? [
            `Player ${p.id} ship count mismatch: ${shipsOnBoard} + ${p.shipsRemaining} !== ${DEFAULT_PIECE_LIMITS.ships}`,
          ]
        : []),
      ...(state.config.enableCitiesAndKnights &&
      basicKnightsOnBoard + p.basicKnightsRemaining !==
        DEFAULT_PIECE_LIMITS.basicKnights
        ? [
            `Player ${p.id} basic knight mismatch: ${basicKnightsOnBoard} + ${p.basicKnightsRemaining} !== ${DEFAULT_PIECE_LIMITS.basicKnights}`,
          ]
        : []),
      ...(state.config.enableCitiesAndKnights &&
      strongKnightsOnBoard + p.strongKnightsRemaining !==
        DEFAULT_PIECE_LIMITS.strongKnights
        ? [
            `Player ${p.id} strong knight mismatch: ${strongKnightsOnBoard} + ${p.strongKnightsRemaining} !== ${DEFAULT_PIECE_LIMITS.strongKnights}`,
          ]
        : []),
      ...(state.config.enableCitiesAndKnights &&
      mightyKnightsOnBoard + p.mightyKnightsRemaining !==
        DEFAULT_PIECE_LIMITS.mightyKnights
        ? [
            `Player ${p.id} mighty knight mismatch: ${mightyKnightsOnBoard} + ${p.mightyKnightsRemaining} !== ${DEFAULT_PIECE_LIMITS.mightyKnights}`,
          ]
        : []),
    ];
  });

  // 4. Cities & Knights Metropolis & Progress Deck conservation
  const ckViolations: string[] = state.config.enableCitiesAndKnights
    ? [
        ...IMPROVEMENT_DISCIPLINES.flatMap((d) => {
          const m = state.metropolises[d];
          if (!m.ownerId || !m.vertexId) return [];
          const b = state.buildings[m.vertexId];
          if (
            !b ||
            b.ownerId !== m.ownerId ||
            b.type !== "city" ||
            b.metropolis !== d
          ) {
            return [
              `Metropolis ${d} state (${m.ownerId}@${m.vertexId}) does not match board building`,
            ];
          }
          return [];
        }),
        ...(!hasRedactedHands
          ? IMPROVEMENT_DISCIPLINES.flatMap((d) => {
              const inDeck = state.progressDecks[d].length;
              const inHands = state.players.reduce<number>(
                (sum, p) =>
                  sum +
                  p.progressCards.filter((c) => c.discipline === d).length +
                  p.publicProgressVpCards.filter(
                    (t) => PROGRESS_CARD_CATALOG[t].discipline === d
                  ).length,
                0
              );
              return inDeck + inHands !==
                CK_THRESHOLDS.progressDeckSizePerDiscipline
                ? [
                    `Progress deck ${d} conservation violated: deck(${inDeck}) + hands/public(${inHands}) !== ${CK_THRESHOLDS.progressDeckSizePerDiscipline}`,
                  ]
                : [];
            })
          : []),
      ]
    : [];

  const violations = [
    ...resourceViolations,
    ...distanceViolations,
    ...pieceViolations,
    ...ckViolations,
  ];

  return {
    valid: violations.length === 0,
    violations,
  };
}
