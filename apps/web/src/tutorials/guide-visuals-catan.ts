import {
  renderActionPieceIconSvg,
  renderDevCardIllustrationSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniTradeGoodCardSvg,
} from "../catan-graphics.ts";

export function renderCatanGuideVisualReferenceHtml(): string {
  const mini = (good: Parameters<typeof renderMiniTradeGoodCardSvg>[0]) =>
    renderMiniTradeGoodCardSvg(good, 28, 18);
  return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">Round structure (on your turn)</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("knight", "#dc2626", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>0. Pre-roll (optional)</strong>
              <span>Play 1 earlier Dev / Alchemist card</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderDieSvg(3, 22)}${renderDieSvg(5, 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>1. Roll 2d6</strong>
              <span>+1 Settle · +2 City · 7 = &gt;7 discard &amp; Robber</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("maritime_trade", "#38bdf8", 22)}${renderActionPieceIconSvg("domestic_trade", "#fde047", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>2. Trade</strong>
              <span>4:1 Bank · 3:1 / 2:1 Harbors · Players</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("settlement", "#ff4a1f", 22)}${renderActionPieceIconSvg("city", "#ff4a1f", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>3. Build &amp; play</strong>
              <span>Build pieces &amp; play ≤1 Dev Card</span>
            </div>
          </div>
        </div>

        <div class="ga-guide-section-label">Building costs &amp; per-player limits</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("road", "#ff4a1f", 20)}<strong style="font-size:12px;">Road (×15)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("ship", "#38bdf8", 20)}<strong style="font-size:12px;">Ship (×15)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("lumber")}${mini("wool")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("settlement", "#ff4a1f", 20)}<strong style="font-size:12px;">Settle (×5 · 1 VP)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}${mini("wool")}${mini("grain")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("city", "#ff4a1f", 20)}<strong style="font-size:12px;">City (×4 · 2 VP)</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("grain")}<span class="t-label ga-num">3×</span>${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("dev_card", "#fbbf24", 20)}<strong style="font-size:12px;">Dev Card</strong></span>
            <span class="ga-guide-recipe__cards">${mini("wool")}${mini("grain")}${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("wall", "#fde68a", 20)}<strong style="font-size:12px;">Wall (×3 · +2 cap)</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("brick")}</span>
          </div>
        </div>

        <div class="ga-guide-section-label">Base Development Card deck (25 cards · 34 in 5–6P · play on a later turn)</div>
        <div class="ga-guide-dev-grid">
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Knight</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×14</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("knight")}</div>
            <span class="ga-guide-dev-card__desc">Move Robber/Pirate &amp; steal 1; 3+ = Largest Army (+2 VP).</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Road Building</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("road_building")}</div>
            <span class="ga-guide-dev-card__desc">Place up to 2 free Roads or Ships immediately.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Year of Plenty</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("year_of_plenty")}</div>
            <span class="ga-guide-dev-card__desc">Take any 2 resource cards directly from the bank.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Monopoly</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("monopoly")}</div>
            <span class="ga-guide-dev-card__desc">Name 1 resource; rivals give you ALL they hold.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Victory Point</strong>
              <span class="ga-chip ga-chip--warn ga-num" style="height:20px;padding:0 6px;">×5</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("victory_point")}</div>
            <span class="ga-guide-dev-card__desc">Counts +1 VP immediately (hidden from rivals).</span>
          </div>
        </div>

        <div class="ga-guide-section-label">Cities &amp; Knights — City commodities, Event Die &amp; Knights</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe" title="Forest cities produce 1 Lumber + 1 Paper (upgrades Science)">
            <span class="ga-guide-recipe__cards">${mini("lumber")}<span class="t-label muted">+</span>${mini("paper")}</span>
            <span class="t-label" style="color:#4ade80;">Forest → Paper (Science)</span>
          </div>
          <div class="ga-guide-recipe" title="Pasture cities produce 1 Wool + 1 Cloth (upgrades Trade)">
            <span class="ga-guide-recipe__cards">${mini("wool")}<span class="t-label muted">+</span>${mini("cloth")}</span>
            <span class="t-label" style="color:#a3e635;">Pasture → Cloth (Trade)</span>
          </div>
          <div class="ga-guide-recipe" title="Mountain cities produce 1 Ore + 1 Coin (upgrades Politics)">
            <span class="ga-guide-recipe__cards">${mini("ore")}<span class="t-label muted">+</span>${mini("coin")}</span>
            <span class="t-label" style="color:#cbd5e1;">Mountain → Coin (Politics)</span>
          </div>
          <div class="ga-guide-recipe" title="Barbarian Ship on Event Die (3 of 6 faces) advances the raid counter toward 7/7">
            <span class="ga-guide-recipe__left">${renderEventDieSvg("barbarian", 22)}<strong style="font-size:12px;">Barbarian Ship</strong></span>
            <span class="t-label ga-num">Raid at 7/7</span>
          </div>
          <div class="ga-guide-recipe" title="City Gate on Event Die + Red Die ≤ your Improvement level draws 1 Progress Card">
            <span class="ga-guide-recipe__cards">${renderEventDieSvg("trade", 20)}${renderEventDieSvg("politics", 20)}${renderEventDieSvg("science", 20)}</span>
            <span class="t-label">Red Die ≤ Lv → Progress</span>
          </div>
          <div class="ga-guide-recipe" title="Recruit/Promote Knight: 1 Wool + 1 Ore · Activate: 1 Grain · Lv 4 City = Metropolis (+2 VP)">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("knight_piece", "#38bdf8", 20)}${renderActionPieceIconSvg("metropolis", "#f59e0b", 20)}</span>
            <span class="t-label">${mini("wool")}${mini("ore")} · Act ${mini("grain")}</span>
          </div>
        </div>
      </div>
    `;
}
