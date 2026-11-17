import type {
  CardColor,
  CardEffect,
  SevenWondersAge,
  SevenWondersCard,
  WonderResourceMap,
} from "../types.ts";

export interface CardSpec {
  readonly templateId: string;
  readonly name: string;
  readonly age: SevenWondersAge;
  readonly color: CardColor;
  readonly copiesAtPlayers: readonly (3 | 4 | 5 | 6 | 7)[];
  readonly coinCost?: number;
  readonly resourceCost?: Partial<WonderResourceMap>;
  readonly freeFromChains?: readonly string[];
  readonly chainsTo?: readonly string[];
  readonly effects: readonly CardEffect[];
}

export function expandCardSpecs(specs: readonly CardSpec[]): SevenWondersCard[] {
  return specs.flatMap((spec) =>
    spec.copiesAtPlayers.map((minPlayers, copyIdx) => ({
      id: `sw-a${spec.age}-${spec.templateId}-${minPlayers}p-${copyIdx + 1}`,
      templateId: spec.templateId,
      name: spec.name,
      age: spec.age,
      color: spec.color,
      minPlayers,
      coinCost: spec.coinCost ?? 0,
      resourceCost: spec.resourceCost ?? {},
      freeFromChains: spec.freeFromChains ?? [],
      chainsTo: spec.chainsTo ?? [],
      effects: spec.effects,
    }))
  );
}
