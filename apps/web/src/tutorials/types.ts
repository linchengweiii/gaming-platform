export type TutorialGameId = "catan" | "splendor" | "azul" | "seven_wonders";

export interface TutorialLesson {
  readonly index: number;
  readonly title: string;
  readonly body: string;
  readonly actionHint: string;
}

interface GameGuideSection {
  readonly heading: string;
  readonly items: readonly string[];
}

export interface GameReferenceGuide {
  readonly gameId: TutorialGameId;
  readonly title: string;
  readonly playersBadge: string;
  readonly durationBadge: string;
  readonly objective: string;
  readonly sections: readonly GameGuideSection[];
}
