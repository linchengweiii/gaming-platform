import { renderAzulTile } from "../azul-view.ts";
import {
  renderSwCoinSvg,
  renderSwResourceBadge,
  renderSwScienceIconSvg,
  renderSwShieldSvg,
} from "../seven-wonders-view.ts";
import { renderSplendorGemToken } from "../splendor-view.ts";
import type { TutorialGameId } from "./types.ts";

export function renderOtherGameVisualReferenceHtml(
  gameId: Exclude<TutorialGameId, "catan">
): string {
  if (gameId === "splendor") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">On your turn — choose 1 of 4 actions</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("emerald", 1, 24)}${renderSplendorGemToken("sapphire", 1, 24)}${renderSplendorGemToken("ruby", 1, 24)}</span>
            <div class="ga-guide-flow__copy">
              <strong>Take 3 distinct</strong>
              <span>1 each of 3 non-Gold colors</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("diamond", 2, 26)}</span>
            <div class="ga-guide-flow__copy">
              <strong>OR Take 2 same</strong>
              <span>Requires ≥4 in that stack</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("gold", 1, 26)}</span>
            <div class="ga-guide-flow__copy">
              <strong>OR Hold 1 card</strong>
              <span>Market or blind deck (≤3) + 1 Gold</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--accent ga-num">+VP</span></span>
            <div class="ga-guide-flow__copy">
              <strong>OR Buy 1 card</strong>
              <span>Permanent -1 gem cost bonus</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Gem stacks by players</strong>
            <span class="t-label ga-num">2P: 4 · 3P: 5 · 4P: 7 (+5 Gold)</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">End-of-turn limits</strong>
            <span class="t-label ga-num">≤10 tokens · ≤3 held cards</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Nobles &amp; Finish</strong>
            <span class="ga-chip ga-chip--warn ga-num">+3 VP auto · 15+ VP end</span>
          </div>
        </div>
      </div>
    `;
  }

  if (gameId === "azul") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">Round phases</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("blue", 22)}${renderAzulTile("blue", 22)}${renderAzulTile("yellow", 22, false, true)}</span>
            <div class="ga-guide-flow__copy">
              <strong>1. Pick 1 color</strong>
              <span>Take all matching; rest → Center</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("red", 22)}${renderAzulTile("red", 22)}${renderAzulTile("red", 22, false, false, "", true)}</span>
            <div class="ga-guide-flow__copy">
              <strong>2. Fill 1 row (1–5)</strong>
              <span>1 color/row · excess → Floor</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("teal", 22)}${renderAzulTile("black", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>3. Tile Wall chains</strong>
              <span>Full rows move 1 tile &amp; score H+V</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Factories &amp; Floor</strong>
            <span class="t-label ga-num">2P:5 3P:7 4P:9 · -1,-1,-2,-2,-2,-3,-3</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Row / Column bonus</strong>
            <span class="ga-chip ga-chip--ok ga-num">+2 Row (ends) · +7 Col</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">All 5 of 1 Color</strong>
            <span class="ga-chip ga-chip--warn ga-num">+10 pts</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="ga-guide-visual">
      <div class="ga-guide-section-label">Simultaneous turn — pick 1 card, then pass hand (↻ Age I/III · ↺ Age II)</div>
      <div class="ga-guide-flow">
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwResourceBadge("wood", 1, true)}${renderSwResourceBadge("glass", 1, true)}</span>
          <div class="ga-guide-flow__copy">
            <strong>1. Build structure</strong>
            <span>Own goods, Chain →, or neighbor 2c/1c</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--warn">▲ Stage</span></span>
          <div class="ga-guide-flow__copy">
            <strong>2. Build Wonder</strong>
            <span>Pay stage cost; tuck card face-down</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwCoinSvg(20)}<span class="t-label ga-num" style="color:#fde047;">+3c</span></span>
          <div class="ga-guide-flow__copy">
            <strong>3. Sell card</strong>
            <span>Discard any card for 3 coins</span>
          </div>
        </div>
      </div>
      <div class="ga-guide-recipes">
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwShieldSvg(18)}<strong style="font-size:12px;">Military (Age I/II/III)</strong></span>
          <span class="t-label ga-num">+1/+3/+5 win · -1 loss</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwScienceIconSvg("compass", 16)}${renderSwScienceIconSvg("gear", 16)}${renderSwScienceIconSvg("tablet", 16)}</span>
          <span class="t-label ga-num">C²+G²+T² + 7×sets</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwCoinSvg(17)}<strong style="font-size:12px;">7 VP Categories</strong></span>
          <span class="t-label ga-num">3c=+1 · Blue · Yellow · Guilds</span>
        </div>
      </div>
    </div>
  `;
}
