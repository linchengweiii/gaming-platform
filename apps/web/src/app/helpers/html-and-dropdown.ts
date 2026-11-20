import { type SupportedLocale, type TranslationKey, t } from "../../i18n/index.ts";
import type { DropdownSpec } from "../types.ts";

export const DRAWN_ARROW_SVG = `<svg class="m-arrow" viewBox="0 0 12 12" aria-hidden="true"><path class="m-arrow__stem" d="M1 6h8"/><path class="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5"/></svg>`;

export const DROPDOWN_CHEV_SVG = `<svg class="ga-dropdown__chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const DROPDOWN_CHECK_SVG = `<svg class="ga-dropdown__check" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.6 7.3L5.6 10.3L11.4 3.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const BRAND_MARK_SVG = `
  <svg class="ga-brand__mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#222427" stroke="rgba(239,240,241,0.16)" stroke-width="1"/>
    <polygon points="16,5 25.5,10.5 25.5,21.5 16,27 6.5,21.5 6.5,10.5" fill="none" stroke="#eff0f1" stroke-width="1.8" stroke-linejoin="round"/>
    <polygon points="16,10.2 20.8,13 20.8,19 16,21.8 11.2,19 11.2,13" fill="#ff4a1f"/>
  </svg>
`;

export function escapeAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeHtml(raw: string): string {
  return escapeAttr(raw);
}

export function renderDropdown(spec: DropdownSpec): string {
  const selectedOpt =
    spec.options.find((o) => o.value === spec.value) ?? spec.options[0]!;
  const classes = [
    "ga-dropdown",
    spec.size === "sm" ? "ga-dropdown--sm" : "",
    spec.inline ? "ga-dropdown--inline" : "",
    spec.align === "end" ? "ga-dropdown--end" : "",
    spec.direction === "up" ? "ga-dropdown--up" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const disAttr = spec.disabled ? "disabled" : "";
  const titleAttr = spec.title ? ` title="${escapeAttr(spec.title)}"` : "";

  return `
    <div class="${classes}" data-dropdown-root="${spec.id}">
      <select id="${spec.id}" class="ga-dropdown__native" tabindex="-1" aria-hidden="true" ${disAttr}>
        ${spec.options
          .map(
            (opt) =>
              `<option value="${escapeAttr(opt.value)}" ${
                opt.value === selectedOpt.value ? "selected" : ""
              }>${escapeAttr(opt.label)}</option>`
          )
          .join("")}
      </select>
      <button
        type="button"
        id="${spec.id}-btn"
        class="ga-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="${spec.id}-menu"
        ${disAttr}${titleAttr}
      >
        <span class="ga-dropdown__label-group">
          <span class="ga-dropdown__value">${escapeHtml(selectedOpt.label)}</span>
          ${
            selectedOpt.meta
              ? `<span class="ga-dropdown__meta">${escapeHtml(selectedOpt.meta)}</span>`
              : `<span class="ga-dropdown__meta" hidden></span>`
          }
        </span>
        ${DROPDOWN_CHEV_SVG}
      </button>
      <div id="${spec.id}-menu" class="ga-dropdown__menu" role="listbox" hidden>
        ${spec.options
          .map(
            (opt) => `
          <button
            type="button"
            class="ga-dropdown__option"
            role="option"
            data-dropdown-value="${escapeAttr(opt.value)}"
            data-dropdown-label="${escapeAttr(opt.label)}"
            data-dropdown-meta="${escapeAttr(opt.meta ?? "")}"
            aria-selected="${opt.value === selectedOpt.value ? "true" : "false"}"
          >
            <span>${escapeHtml(opt.label)}</span>
            <span class="ga-dropdown__option-right">
              ${opt.meta ? `<span class="ga-dropdown__meta">${escapeHtml(opt.meta)}</span>` : ""}
              ${DROPDOWN_CHECK_SVG}
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

export function formatPhaseLabel(
  phase: string,
  locale: SupportedLocale = "en"
): string {
  const key = `phase.${phase}` as TranslationKey;
  const translated = t(locale, key);
  if (translated !== key) {
    return translated;
  }
  if (phase === "CK_INTERACTION") return t(locale, "phase.CK_INTERACTION");
  const clean = phase.replace(/_/g, " ").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
