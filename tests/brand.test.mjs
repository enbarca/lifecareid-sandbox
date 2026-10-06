// The documents keep the rules the README states: no em dash, no exclamation
// point, no emoji, and the mark written LifeCare.ID® wherever it is text.
// Code blocks and inline code are not text. Run: node --test (from the kit root)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);
const DOCS = [
  "README.md", "CONTRIBUTING.md", "NOTICE", "pages/README.md", "compose/README.md",
  "contract/README.md", "examples/README.md",
];
const DATA = ["package.json", "contract/server.json", "compose/docker-compose.yml"];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const prose = (text) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

for (const path of DOCS) {
  test(`${path} keeps the brand rules`, () => {
    const text = read(path);
    assert.ok(!text.includes("—"), `${path}: an em dash`);
    const p = prose(text);
    assert.ok(!p.replace(/!\[/g, "").includes("!"), `${path}: an exclamation point`);
    assert.ok(!EMOJI.test(p), `${path}: an emoji`);
    for (const m of p.matchAll(/LifeCare\.ID(?!®)/g)) {
      assert.fail(`${path}: LifeCare.ID without the mark near ${JSON.stringify(p.slice(m.index - 20, m.index + 15))}`);
    }
  });
}

for (const path of DATA) {
  test(`${path} carries the mark and no em dash`, () => {
    const text = read(path);
    assert.ok(!text.includes("—"), `${path}: an em dash`);
    for (const m of text.matchAll(/LifeCare\.ID(?!®)/g)) {
      // LIFECAREID_* variable names are not the mark; the regex is case-sensitive.
      assert.fail(`${path}: LifeCare.ID without the mark near ${JSON.stringify(text.slice(m.index - 20, m.index + 15))}`);
    }
  });
}
