import type { SupportedLocale } from "./types.ts";

const RESOURCE_WORD_ZH: Readonly<Record<string, string>> = {
  brick: "磚塊",
  lumber: "木材",
  wool: "羊毛",
  grain: "小麥",
  ore: "礦石",
  paper: "紙張",
  cloth: "布料",
  coin: "錢幣",
  emerald: "祖母綠",
  diamond: "鑽石",
  sapphire: "藍寶石",
  onyx: "黑瑪瑙",
  ruby: "紅寶石",
  gold: "黃金",
  blue: "鈷藍",
  yellow: "琥珀黃",
  red: "陶紅",
  black: "黑曜石",
  teal: "藍綠花磚",
};

function translateTokenListZh(raw: string): string {
  return raw.replace(
    /\b(brick|lumber|wool|grain|ore|paper|cloth|coin|emerald|diamond|sapphire|onyx|ruby|gold|blue|yellow|red|black|teal)\b/gi,
    (m) => RESOURCE_WORD_ZH[m.toLowerCase()] ?? m
  );
}

const ZH_TW_EVENT_PATTERNS: ReadonlyArray<
  readonly [RegExp, (...args: string[]) => string]
> = [
  [
    /^(.+?) rolled (\d+) \((\d+)\+(\d+)\)(.*)$/,
    (_m, name, total, d1, d2, tail) =>
      `${name} 擲出 ${total}（${d1}+${d2}）${tail
        .replace(/with Barbarian Ship/gi, "，事件骰：蠻族船")
        .replace(/with Trade Gate/gi, "，事件骰：貿易城門")
        .replace(/with Politics Gate/gi, "，事件骰：政治城門")
        .replace(/with Science Gate/gi, "，事件骰：科學城門")}`,
  ],
  [
    /^(.+?) placed (?:a |their (?:1st|2nd) )?(?:starting )?settlement(.*)$/,
    (_m, name, rest) => `${name} 放置了起始村莊${translateTokenListZh(rest)}`,
  ],
  [
    /^(.+?) placed (?:a |their (?:1st|2nd) )?(?:starting )?city(.*)$/,
    (_m, name, rest) => `${name} 放置了起始城市${translateTokenListZh(rest)}`,
  ],
  [
    /^(.+?) placed (?:a )?starting (road|ship)(.*)$/,
    (_m, name, kind, rest) =>
      `${name} 放置了起始${kind === "ship" ? "船隻" : "道路"}${rest}`,
  ],
  [
    /^(.+?) built a (road|ship|settlement|city wall|city)(.*)$/,
    (_m, name, kind, rest) => {
      const label =
        kind === "road"
          ? "道路"
          : kind === "ship"
            ? "船隻"
            : kind === "settlement"
              ? "村莊"
              : kind === "city wall"
                ? "城牆"
                : "城市";
      return `${name} 建造了${label}${rest}`;
    },
  ],
  [
    /^(.+?) upgraded a settlement to a city(.*)$/,
    (_m, name, rest) => `${name} 將村莊升級為城市${rest}`,
  ],
  [
    /^(.+?) bought a development card(.*)$/,
    (_m, name, rest) => `${name} 購買了 1 張發展卡${rest}`,
  ],
  [
    /^(.+?) ended turn\.?$/,
    (_m, name) => `${name} 結束了回合。`,
  ],
  [
    /^(.+?) moved the (robber|pirate)(.*)$/,
    (_m, name, kind, rest) =>
      `${name} 移動了${kind === "pirate" ? "海盜" : "強盜"}${rest}`,
  ],
  [
    /^(.+?) stole 1 card from (.+?)\.?$/,
    (_m, name, victim) => `${name} 從 ${victim} 搶奪了 1 張手牌。`,
  ],
  [
    /^(.+?) discarded (\d+) cards?\.?$/,
    (_m, name, count) => `${name} 棄掉了 ${count} 張牌。`,
  ],
  [
    /^(.+?) traded with the bank(.*)$/,
    (_m, name, rest) => `${name} 與銀行完成了交易${translateTokenListZh(rest)}`,
  ],
  [
    /^(.+?) completed trade with (.+?)(.*)$/,
    (_m, name, other, rest) =>
      `${name} 與 ${other} 完成了交易${translateTokenListZh(rest)}`,
  ],
  [
    /^(.+?) took (.+?) tokens?\.?$/,
    (_m, name, gems) => `${name} 拿取了${translateTokenListZh(gems)}籌碼。`,
  ],
  [
    /^(.+?) purchased Tier (\d+) card(.*)$/,
    (_m, name, tier, rest) =>
      `${name} 購買了等級 ${tier} 發展卡${translateTokenListZh(rest)}`,
  ],
  [
    /^(.+?) reserved (.+?)\.?$/,
    (_m, name, rest) => `${name} 保留了${translateTokenListZh(rest)}。`,
  ],
  [
    /^(.+?) attracted (.+?)\.?$/,
    (_m, name, noble) => `${name} 吸引了貴族 ${noble}。`,
  ],
  [
    /^(.+?) drafted (\d+) ([a-z]+) tiles? from (.+?) to (.+?)\.?$/i,
    (_m, name, count, color, src, dst) =>
      `${name} 從${src
        .replace(/^Factory (\d+)$/i, "工廠 $1")
        .replace(/^center pool$/i, "中央區")}拿取 ${count} 塊${
        RESOURCE_WORD_ZH[color.toLowerCase()] ?? color
      }花磚放入${dst
        .replace(/^pattern line (\d+)$/i, "第 $1 花紋列")
        .replace(/^floor line$/i, "地板區")}。`,
  ],
  [
    /^Age (I{1,3}) begins(.*)$/,
    (_m, roman, rest) => `時代 ${roman} 開始${rest}`,
  ],
  [
    /^(.+?) wins (.+?) with (\d+) (VP|points|prestige points)(.*)$/,
    (_m, name, game, score, _unit, rest) =>
      `${name} 以 ${score} 分贏得 ${game}${rest}`,
  ],
];

export function localizeEventLogMessage(
  message: string,
  locale: SupportedLocale
): string {
  if (locale === "en") return message;
  for (const [pattern, formatter] of ZH_TW_EVENT_PATTERNS) {
    if (pattern.test(message)) {
      return message.replace(pattern, formatter);
    }
  }
  return message;
}
