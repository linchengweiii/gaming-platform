import type { AppModel } from "../types.ts";
import type { AppRuntimeContext } from "./context.ts";

export function onClick(
  root: HTMLElement,
  selector: string,
  handler: (ev: Event) => void
): void {
  root.querySelector(selector)?.addEventListener("click", handler);
}

export function onChange(
  root: HTMLElement,
  selector: string,
  handler: (ev: Event) => void
): void {
  root.querySelector(selector)?.addEventListener("change", handler);
}

export function onDataClick(
  root: HTMLElement,
  attr: string,
  handler: (value: string, el: Element, ev: Event) => void
): void {
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    el.addEventListener("click", (ev) => {
      const value = el.getAttribute(attr);
      if (value !== null) handler(value, el, ev);
    });
  });
}

export function patchModelAndRender(
  ctx: AppRuntimeContext,
  patch: Partial<AppModel>
): void {
  ctx.model = { ...ctx.model, ...patch };
  ctx.render();
}
