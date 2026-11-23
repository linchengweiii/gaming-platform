import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function countFileLines(raw: string): number {
  if (raw.length === 0) {
    return 0;
  }
  const normalized = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  return normalized.split("\n").length;
}

describe("Codebase Pure-Functional & Readability Constraints", () => {
  test("enforces functional style across all project TypeScript source files (zero classes, zero `this`, zero OOP project `new` calls)", () => {
    const targetDirs = ["packages", "apps", "scripts"].map((d) =>
      path.join(REPO_ROOT, d)
    );

    const collectTsFiles = (dir: string): readonly string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "public"
        ) {
          return [];
        }
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory()
          ? collectTsFiles(fullPath)
          : entry.isFile() && entry.name.endsWith(".ts")
            ? [fullPath]
            : [];
      });

    const sourceFiles = targetDirs.flatMap(collectTsFiles);
    expect(sourceFiles.length).toBeGreaterThanOrEqual(28);

    const stripLiteralsAndComments = (src: string): string => {
      let out = "";
      let i = 0;
      let prevNonSpace = "(";
      const templateBraceStack: number[] = [];
      let braceDepth = 0;
      let mode:
        | "code"
        | "line_comment"
        | "block_comment"
        | "single"
        | "double"
        | "regex"
        | "template" = "code";
      let inRegexCharClass = false;

      while (i < src.length) {
        const ch = src[i]!;
        const next = src[i + 1] ?? "";

        if (mode === "line_comment") {
          if (ch === "\n") {
            out += "\n";
            mode = "code";
          } else {
            out += " ";
          }
          i++;
          continue;
        }

        if (mode === "block_comment") {
          if (ch === "*" && next === "/") {
            out += "  ";
            i += 2;
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
            i++;
          }
          continue;
        }

        if (mode === "regex") {
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === "[") {
            inRegexCharClass = true;
            out += " ";
            i++;
            continue;
          }
          if (ch === "]") {
            inRegexCharClass = false;
            out += " ";
            i++;
            continue;
          }
          if (ch === "/" && !inRegexCharClass) {
            out += " ";
            i++;
            while (i < src.length && /[dgimsuvy]/.test(src[i]!)) {
              out += " ";
              i++;
            }
            prevNonSpace = "/";
            mode = "code";
            continue;
          }
          out += ch === "\n" ? "\n" : " ";
          i++;
          continue;
        }

        if (mode === "single" || mode === "double") {
          const quote = mode === "single" ? "'" : '"';
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === quote) {
            out += " ";
            prevNonSpace = quote;
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
          }
          i++;
          continue;
        }

        if (mode === "template") {
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === "$" && next === "{") {
            templateBraceStack.push(braceDepth);
            out += "  ";
            i += 2;
            prevNonSpace = "{";
            mode = "code";
            continue;
          }
          if (ch === "`") {
            out += " ";
            prevNonSpace = "`";
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
          }
          i++;
          continue;
        }

        // mode === "code"
        if (ch === "/" && next === "/") {
          out += "  ";
          i += 2;
          mode = "line_comment";
          continue;
        }
        if (ch === "/" && next === "*") {
          out += "  ";
          i += 2;
          mode = "block_comment";
          continue;
        }
        if (
          ch === "/" &&
          next !== "=" &&
          "=(,:;!&|?{}[~^+-*%<>".includes(prevNonSpace)
        ) {
          out += " ";
          i++;
          inRegexCharClass = false;
          mode = "regex";
          continue;
        }
        if (ch === "'") {
          out += " ";
          i++;
          mode = "single";
          continue;
        }
        if (ch === '"') {
          out += " ";
          i++;
          mode = "double";
          continue;
        }
        if (ch === "`") {
          out += " ";
          i++;
          mode = "template";
          continue;
        }
        if (ch === "{") {
          braceDepth++;
          out += ch;
          prevNonSpace = ch;
          i++;
          continue;
        }
        if (ch === "}") {
          if (
            templateBraceStack.length > 0 &&
            braceDepth === templateBraceStack[templateBraceStack.length - 1]
          ) {
            templateBraceStack.pop();
            out += " ";
            i++;
            mode = "template";
            continue;
          }
          braceDepth = Math.max(0, braceDepth - 1);
          out += ch;
          prevNonSpace = ch;
          i++;
          continue;
        }

        if (!/\s/.test(ch)) {
          prevNonSpace = ch;
        }
        out += ch;
        i++;
      }

      return out;
    };

    const bannedNewPattern =
      /\bnew\s+(SeededRNG|GameRegistry|MatchSession|PlatformRoomManager|MultiGamePlatformApp)\b/;

    const violations = sourceFiles.flatMap((filePath) => {
      const rel = path.relative(REPO_ROOT, filePath);
      const raw = fs.readFileSync(filePath, "utf8");
      const stripped = stripLiteralsAndComments(raw);
      return stripped.split("\n").flatMap((lineText, idx) => {
        const lineNo = idx + 1;
        return [
          ...(/\bclass\b/.test(lineText)
            ? [`${rel}:${lineNo} unexpected 'class' keyword: ${lineText.trim()}`]
            : []),
          ...(/\bthis\b/.test(lineText)
            ? [`${rel}:${lineNo} unexpected 'this' keyword: ${lineText.trim()}`]
            : []),
          ...(bannedNewPattern.test(lineText)
            ? [`${rel}:${lineNo} unexpected OOP 'new' call: ${lineText.trim()}`]
            : []),
        ];
      });
    });

    expect(violations).toEqual([]);
  });

  test("enforces readable <= 500-line file size limit across all project TypeScript, JS, and CSS files", () => {
    const excludedDirs = new Set(["node_modules", "dist", "build"]);
    const isTrackedSourceFile = (fileName: string): boolean =>
      fileName.endsWith(".ts") ||
      fileName.endsWith(".js") ||
      fileName.endsWith(".css");

    const collectTrackedFiles = (dir: string): readonly string[] => {
      if (!fs.existsSync(dir)) {
        return [];
      }
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (excludedDirs.has(entry.name)) {
          return [];
        }
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory()
          ? collectTrackedFiles(fullPath)
          : entry.isFile() && isTrackedSourceFile(entry.name)
            ? [fullPath]
            : [];
      });
    };

    const scanRoots = [
      "packages",
      "apps/server",
      "apps/web/src",
      "apps/web/public",
      "scripts",
      "tests",
    ].map((relDir) => path.join(REPO_ROOT, relDir));

    const allCheckedFiles = Array.from(
      new Set(scanRoots.flatMap(collectTrackedFiles))
    ).sort();

    expect(allCheckedFiles.length).toBeGreaterThanOrEqual(35);

    const oversizedViolations = allCheckedFiles.flatMap((filePath) => {
      const lineCount = countFileLines(fs.readFileSync(filePath, "utf8"));
      if (lineCount <= 500) {
        return [];
      }
      const rel = path.relative(REPO_ROOT, filePath);
      return [`${rel}: ${lineCount} lines (exceeds 500-line limit)`];
    });

    expect(oversizedViolations).toEqual([]);
  });
});
