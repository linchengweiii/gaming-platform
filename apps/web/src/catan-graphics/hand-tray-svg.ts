import {
  COMMODITIES,
  type CatanAction,
  type CatanPlayerState,
  type CatanState,
  type DevCardType,
  type ImprovementDiscipline,
  PROGRESS_CARD_CATALOG,
  type ProgressCardType,
  RESOURCES,
  getPlayerSafeHandLimit,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  COMMODITY_META,
  DEV_CARD_META,
  DISCIPLINE_META,
  RESOURCE_META,
} from "../config/catan-palette-config.ts";
import {
  renderCommodityCardIllustrationSvg,
  renderDevCardIllustrationSvg,
  renderProgressCardIllustrationSvg,
  renderResourceCardIllustrationSvg,
} from "./cards-and-dice-svg.ts";
import {
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "./harbors-and-tokens.ts";

/**
 * Renders the visual tabletop Card Hand tray for the active/human player in Catan.
 */
export function renderCatanVisualHandTray(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[]
): string {
  const safeLimit = getPlayerSafeHandLimit(state, player.id);
  const totalRes = totalResourceCount(player.resources);

  if (state.config.enableCitiesAndKnights) {
    const totalComm = totalCommodityCount(player.commodities);
    const totalHandCards = totalRes + totalComm;
    const progressGroups = new Map<
      ProgressCardType,
      {
        total: number;
        discipline: ImprovementDiscipline;
        playableCardId: string | null;
      }
    >();

    for (const card of player.progressCards) {
      const existing = progressGroups.get(card.type) ?? {
        total: 0,
        discipline: card.discipline,
        playableCardId: null,
      };
      existing.total += 1;
      if (!existing.playableCardId) {
        const matchingLegal = legalActions.find(
          (a) =>
            a.type === "PLAY_PROGRESS_CARD" &&
            (a.cardId === card.id ||
              player.progressCards.find((pc) => pc.id === a.cardId)?.type ===
                card.type)
        );
        if (matchingLegal && matchingLegal.type === "PLAY_PROGRESS_CARD") {
          existing.playableCardId = matchingLegal.cardId;
        }
      }
      progressGroups.set(card.type, existing);
    }

    return `
      <div class="visual-hand-tray ck-hand-tray">
        <div class="hand-tray-header">
          <div class="hand-tray-header__left">
            <span class="player-dot" style="background: ${player.color}"></span>
            <strong style="font-size: var(--t-small); font-weight: 500;">${player.name} hand</strong>
            <span class="ga-chip ${totalHandCards > safeLimit ? "ga-chip--danger" : "ga-chip--ok"} ga-num">
              ${totalHandCards}/${safeLimit} cards (${totalRes}R · ${totalComm}C)
            </span>
            <span class="ga-chip ga-num">
              ${player.progressCards.length}/4 progress
            </span>
            ${
              player.publicProgressVpCards.length > 0
                ? `<span class="ga-chip ga-chip--warn ga-num">+${player.publicProgressVpCards.length} VP (${player.publicProgressVpCards.map((t) => PROGRESS_CARD_CATALOG[t].title).join(", ")})</span>`
                : ""
            }
          </div>
          <div class="hand-tray-header__hint muted">
            Select a resource or commodity to trade, upgrade cities, or play a progress card
          </div>
        </div>

        <div class="hand-cards-scroll">
          <div class="hand-section-cards">
            ${RESOURCES.map((res) => {
              const count = player.resources[res];
              const meta = RESOURCE_META[res];
              const hasCards = count > 0;
              const stackAttr =
                count >= 3 ? 'data-stack="3"' : count === 2 ? 'data-stack="2"' : "";
              return `
                <div class="playing-card resource-playing-card ${
                  hasCards ? "has-cards" : "empty-card"
                }"
                     data-hand-res-card="${res}" ${stackAttr}
                     style="--card-top: ${meta.bgTop}; --card-bottom: ${
                       meta.bgBottom
                     }; --card-border: ${meta.border}; --card-accent: ${meta.accent};">
                  <div class="playing-card-top">
                    <span class="playing-card-glyph">${renderResourceGlyphSvg(res)}</span>
                    <span class="playing-card-count ${hasCards ? "active" : ""}">×${count}</span>
                  </div>
                  <div class="playing-card-art">
                    ${renderResourceCardIllustrationSvg(res)}
                  </div>
                  <div class="playing-card-footer">
                    <div class="playing-card-title">${meta.label}</div>
                    <div class="playing-card-sub">${meta.subtitle}</div>
                  </div>
                </div>
              `;
            }).join("")}
            ${COMMODITIES.map((comm) => {
              const count = player.commodities[comm];
              const meta = COMMODITY_META[comm];
              const hasCards = count > 0;
              const stackAttr =
                count >= 3 ? 'data-stack="3"' : count === 2 ? 'data-stack="2"' : "";
              return `
                <div class="playing-card resource-playing-card commodity-playing-card ${
                  hasCards ? "has-cards" : "empty-card"
                }"
                     data-hand-res-card="${comm}" ${stackAttr}
                     style="--card-top: ${meta.bgTop}; --card-bottom: ${
                       meta.bgBottom
                     }; --card-border: ${meta.border}; --card-accent: ${meta.accent};">
                  <div class="playing-card-top">
                    <span class="playing-card-glyph">${renderCommodityGlyphSvg(comm)}</span>
                    <span class="playing-card-count ${hasCards ? "active" : ""}">×${count}</span>
                  </div>
                  <div class="playing-card-art">
                    ${renderCommodityCardIllustrationSvg(comm)}
                  </div>
                  <div class="playing-card-footer">
                    <div class="playing-card-title">${meta.label}</div>
                    <div class="playing-card-sub">${meta.subtitle}</div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>

          <div class="hand-divider"></div>

          <div class="hand-section-cards">
            ${
              progressGroups.size === 0
                ? `<div class="empty-dev-placeholder">
                     <strong style="color: var(--ink); font-weight: 500;">No progress cards</strong>
                     <span>Upgrade Trade, Politics, or Science to earn cards on rolls</span>
                   </div>`
                : Array.from(progressGroups.entries())
                    .map(([cardType, info]) => {
                      const cat = PROGRESS_CARD_CATALOG[cardType];
                      const dMeta = DISCIPLINE_META[info.discipline];
                      const canPlayThis = Boolean(info.playableCardId);
                      return `
                        <div class="playing-card dev-playing-card ${
                          canPlayThis ? "playable-dev-card" : ""
                        }"
                             style="--card-border: ${dMeta.border}; --card-accent: ${dMeta.accent};">
                          <div class="playing-card-top">
                            <span class="ga-chip" style="height: 22px; padding: 0 8px;">${
                              dMeta.label
                            }</span>
                            <span class="playing-card-count active">×${info.total}</span>
                          </div>
                          <div class="playing-card-art">
                            ${renderProgressCardIllustrationSvg(info.discipline)}
                          </div>
                          <div class="dev-card-title">${cat.title}</div>
                          <div class="dev-card-rule">${cat.description}</div>
                          <div class="dev-card-action">
                            ${
                              canPlayThis
                                ? `<button type="button" class="btn btn--primary btn--sm" data-play-progress-card="${info.playableCardId}" style="width: 100%;">Play ${cat.title.toLowerCase()}</button>`
                                : `<span class="ga-chip" style="width: 100%; justify-content: center;">${
                                    cat.phase === "PRE_ROLL"
                                      ? "Play pre-roll"
                                      : "Main phase"
                                  }</span>`
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join("")
            }
          </div>
        </div>
      </div>
    `;
  }

  const unplayedDevs = player.devCards.filter((c) => !c.played);

  const devGroups = new Map<
    DevCardType,
    { total: number; playableNow: boolean; boughtThisTurn: number }
  >();
  for (const c of unplayedDevs) {
    const existing = devGroups.get(c.type) ?? {
      total: 0,
      playableNow: false,
      boughtThisTurn: 0,
    };
    existing.total++;
    if (c.boughtOnTurn === state.turn) {
      existing.boughtThisTurn++;
    }
    devGroups.set(c.type, existing);
  }

  const canPlayKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
  const canPlayRoadBuild = legalActions.some(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  const canPlayYoP = legalActions.some((a) => a.type === "PLAY_YEAR_OF_PLENTY");
  const canPlayMonopoly = legalActions.some((a) => a.type === "PLAY_MONOPOLY");

  return `
    <div class="visual-hand-tray">
      <div class="hand-tray-header">
        <div class="hand-tray-header__left">
          <span class="player-dot" style="background: ${player.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${player.name} hand</strong>
          <span class="ga-chip ${totalRes > safeLimit ? "ga-chip--danger" : "ga-chip--ok"} ga-num">
            ${totalRes}/${safeLimit} resources
          </span>
          <span class="ga-chip ga-num">
            ${unplayedDevs.length} dev ${unplayedDevs.length === 1 ? "card" : "cards"}
          </span>
        </div>
        <div class="hand-tray-header__hint muted">
          Select a resource card to trade or discard, or play a development card
        </div>
      </div>

      <div class="hand-cards-scroll">
        <div class="hand-section-cards">
          ${RESOURCES.map((res) => {
            const count = player.resources[res];
            const meta = RESOURCE_META[res];
            const hasCards = count > 0;
            const stackAttr =
              count >= 3 ? 'data-stack="3"' : count === 2 ? 'data-stack="2"' : "";
            return `
              <div class="playing-card resource-playing-card ${
                hasCards ? "has-cards" : "empty-card"
              }"
                   data-hand-res-card="${res}" ${stackAttr}
                   style="--card-top: ${meta.bgTop}; --card-bottom: ${
                     meta.bgBottom
                   }; --card-border: ${meta.border}; --card-accent: ${meta.accent};">
                <div class="playing-card-top">
                  <span class="playing-card-glyph">${renderResourceGlyphSvg(res)}</span>
                  <span class="playing-card-count ${hasCards ? "active" : ""}">×${count}</span>
                </div>
                <div class="playing-card-art">
                  ${renderResourceCardIllustrationSvg(res)}
                </div>
                <div class="playing-card-footer">
                  <div class="playing-card-title">${meta.label}</div>
                  <div class="playing-card-sub">${meta.subtitle}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <div class="hand-divider"></div>

        <div class="hand-section-cards">
          ${
            devGroups.size === 0
              ? `<div class="empty-dev-placeholder">
                   <strong style="color: var(--ink); font-weight: 500;">No development cards</strong>
                   <span>Cost: 1 wool, 1 grain, 1 ore</span>
                 </div>`
              : Array.from(devGroups.entries())
                  .map(([devType, info]) => {
                    const meta = DEV_CARD_META[devType];
                    let canPlayThis = false;
                    let playBtnId = "";
                    if (devType === "knight" && canPlayKnight) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-knight";
                    } else if (
                      devType === "road_building" &&
                      canPlayRoadBuild
                    ) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-roadbuild";
                    } else if (devType === "year_of_plenty" && canPlayYoP) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-yop";
                    } else if (devType === "monopoly" && canPlayMonopoly) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-mono";
                    }

                    return `
                      <div class="playing-card dev-playing-card ${
                        canPlayThis ? "playable-dev-card" : ""
                      }"
                           style="--card-border: ${meta.border}; --card-accent: ${meta.accent};">
                        <div class="playing-card-top">
                          <span class="ga-chip" style="height: 22px; padding: 0 8px;">${
                            meta.category
                          }</span>
                          <span class="playing-card-count active">×${info.total}</span>
                        </div>
                        <div class="playing-card-art">
                          ${renderDevCardIllustrationSvg(devType)}
                        </div>
                        <div class="dev-card-title">${meta.title}</div>
                        <div class="dev-card-rule">${meta.rule}</div>
                        <div class="dev-card-action">
                          ${
                            devType === "victory_point"
                              ? `<span class="ga-chip ga-chip--warn" style="width: 100%; justify-content: center;">+1 VP active</span>`
                              : canPlayThis
                                ? `<button id="${playBtnId}" type="button" class="btn btn--primary btn--sm" style="width: 100%;">Play ${meta.title.toLowerCase()}</button>`
                                : info.boughtThisTurn === info.total
                                  ? `<span class="ga-chip" style="width: 100%; justify-content: center;">Bought this turn</span>`
                                  : `<span class="ga-chip" style="width: 100%; justify-content: center;">Play on your turn</span>`
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join("")
          }
        </div>
      </div>
    </div>
  `;
}
