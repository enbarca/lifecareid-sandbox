#!/usr/bin/env node
// Brings the files this kit mirrors in step with their source of truth, a
// local lifecareid checkout, at a commit you name.
//
//   node scripts/sync-upstream.mjs --from <lifecareid checkout> --ref <commit>
//   node scripts/sync-upstream.mjs --from <lifecareid checkout> --ref <commit> --check
//
// The first form writes the kit files. The second writes the same files into a
// temporary directory and diffs them against this working tree: exit 0 when
// identical, exit 1 with the diff when not. Neither form fetches anything or
// reads the checkout's working tree: every upstream file is read with
// `git -C <from> show <sha>:<path>`, so the result is pinned to the commit.
//
// What maps to what, and the literal substitutions applied on the way, are data
// in sync/map.json. The four upstream directories the script may read are fixed
// below, in code, so widening them is a change a reviewer sees here. The commit
// synced from is written to sync/UPSTREAM (the full SHA and its date).
//
// Node 22, no dependencies. Needs the private checkout, so it is a maintainer's
// tool and is not run in CI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The only upstream directories this script reads. Nothing else is read, copied
// or named, whatever sync/map.json says.
export const ALLOWED_UPSTREAM = ["libs/sandbox-source/", "functions/", "tests/js/", "docs/contracts/"];

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_PATH = join(KIT_ROOT, "sync", "map.json");

class SyncError extends Error {}
const fail = (message) => { throw new SyncError(message); };

function usage() {
  return "usage: node scripts/sync-upstream.mjs --from <lifecareid checkout> --ref <commit> [--check]";
}

function parseArgs(argv) {
  const args = { check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--from" || a === "--ref") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`${a} needs a value\n${usage()}`);
      args[a.slice(2)] = value;
      i += 1;
    } else fail(`unknown argument ${JSON.stringify(a)}\n${usage()}`);
  }
  if (!args.from || !args.ref) fail(usage());
  return args;
}

function git(from, gitArgs) {
  const r = spawnSync("git", ["-C", from, ...gitArgs], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) fail(`could not run git: ${r.error.message}`);
  if (r.status !== 0) fail(`git ${gitArgs.join(" ")} failed: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

// ------------------------------------------------------------------- the map

function loadMap() {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  const entries = [...map.files];
  if (map.contract) entries.push({ from: map.contract.from, to: map.contract.to, replace: [] });
  for (const e of entries) {
    checkUpstreamPath(e.from);
    checkKitPath(e.to);
    if (e.to === map.upstream_file) fail(`${e.to} is the sync record, not a mapped file`);
  }
  checkKitPath(map.upstream_file);
  if (map.contract) checkKitPath(map.contract.readme.path);
  return map;
}

function checkUpstreamPath(path) {
  const clean = posix.normalize(path);
  if (clean !== path || path.startsWith("/") || path.split("/").includes("..")) {
    fail(`upstream path ${JSON.stringify(path)} is not a plain relative path`);
  }
  if (!ALLOWED_UPSTREAM.some((dir) => path.startsWith(dir))) {
    fail(`upstream path ${JSON.stringify(path)} is outside the allowed directories (${ALLOWED_UPSTREAM.join(", ")})`);
  }
}

function checkKitPath(path) {
  const clean = posix.normalize(path);
  if (clean !== path || path.startsWith("/") || path.split("/").includes("..") || path.startsWith(".git/")) {
    fail(`kit path ${JSON.stringify(path)} is not a plain relative path inside the kit`);
  }
}

// -------------------------------------------------------------- the checkout

function resolveCommit(from, ref) {
  const sha = git(from, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`${ref} does not name a commit in ${from}`);
  const date = git(from, ["show", "-s", "--format=%cs", sha]).trim();
  return { sha, date };
}

function readUpstream(from, sha, path) {
  // A regular file at that commit, never a link or a submodule.
  const tree = git(from, ["ls-tree", sha, "--", path]).trim();
  const mode = tree.split(/\s+/)[0];
  if (mode !== "100644" && mode !== "100755") fail(`${path} is not a regular file at ${sha.slice(0, 12)}`);
  return git(from, ["show", `${sha}:${path}`]);
}

// ------------------------------------------------------ the private-name gate

// Returns the 1-based line numbers of `text` that hold a listed name. Entries
// are {length, sha256} of the lower-cased name; every window of that length in
// a line is hashed, so a match is a substring match, as the names gate does.
function privateNameLines(text, entries) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].toLowerCase();
    let hit = false;
    for (const { length, sha256 } of entries) {
      for (let start = 0; !hit && start + length <= line.length; start += 1) {
        hit = createHash("sha256").update(line.slice(start, start + length)).digest("hex") === sha256;
      }
    }
    if (hit) hits.push(i + 1);
  }
  return hits;
}

// -------------------------------------------------------------- substitutions

function countOf(text, find) {
  return find === "" ? 0 : text.split(find).length - 1;
}

function substitute(text, replacements, label) {
  let out = text;
  for (const { find, with: to, count = 1 } of replacements) {
    const n = countOf(out, find);
    if (n !== count) {
      fail(`${label}: the substitution for ${JSON.stringify(find.slice(0, 60))} matches ${n} times, expected ${count}; update sync/map.json`);
    }
    out = out.split(find).join(to);
  }
  return out;
}

// ------------------------------------------------------------------ the sync

// Builds { kit path: content } for every file the sync owns, in memory. Nothing
// is written until every file has passed the gate.
function build({ from, sha, date, map }) {
  const out = new Map();
  const refused = [];
  const names = map.private_names.entries;

  const take = (upstreamPath) => {
    const text = readUpstream(from, sha, upstreamPath);
    for (const line of privateNameLines(text, names)) refused.push(`${upstreamPath}:${line}`);
    return text;
  };

  for (const entry of map.files) {
    out.set(entry.to, substitute(take(entry.from), entry.replace, entry.from));
  }

  if (map.contract) {
    const { contract } = map;
    const raw = take(contract.from);
    const spec = JSON.parse(raw);
    out.set(contract.to, raw);

    const readmeText = readFileSync(join(KIT_ROOT, contract.readme.path), "utf8");
    const lines = readmeText.split("\n");
    const at = lines.reduce((acc, l, i) => (l.startsWith(contract.readme.line_prefix) ? [...acc, i] : acc), []);
    if (at.length !== 1) {
      fail(`${contract.readme.path}: expected exactly one line starting ${JSON.stringify(contract.readme.line_prefix)}, found ${at.length}`);
    }
    lines[at[0]] = contract.readme.line
      .replace("{version}", spec.info.version)
      .replace("{paths}", String(Object.keys(spec.paths).length))
      .replace("{short}", sha.slice(0, 12))
      .replace("{date}", date);
    out.set(contract.readme.path, lines.join("\n"));
  }

  out.set(map.upstream_file, `${sha} ${date}\n`);

  if (refused.length) {
    fail(
      "refused: an upstream file carries a name on the private list; nothing was written.\n" +
      refused.map((r) => `  ${r}`).join("\n") +
      "\nFix it upstream, then sync again. The kit stays at its previous sync for these files.",
    );
  }
  return out;
}

function writeTree(root, files) {
  for (const [rel, content] of files) {
    const target = join(root, ...rel.split("/"));
    if (existsSync(target) && readFileSync(target, "utf8") === content) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
}

// A fixed per-user directory, so repeated checks do not pile up directories and
// nothing needs deleting. Refuses anything that is not a plain directory.
function checkDir() {
  const dir = join(tmpdir(), `lifecareid-sandbox-sync-check-${userInfo().uid}`);
  if (existsSync(dir)) {
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) fail(`${dir} is not a plain directory`);
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) fail(`${dir} is not yours`);
  } else {
    mkdirSync(dir, { mode: 0o700 });
  }
  return dir;
}

function unifiedDiff(a, b, label) {
  const r = spawnSync("diff", ["-u", "--label", `kit/${label}`, "--label", `sync/${label}`, a, b], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) return `${label}: differs (diff is not available to show how)\n`;
  return r.stdout;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = resolve(args.from);
  if (!existsSync(from)) fail(`${from} does not exist`);
  if (resolve(from) === KIT_ROOT || from.startsWith(KIT_ROOT + sep)) fail("--from must be the lifecareid checkout, not this kit");
  const { sha, date } = resolveCommit(from, args.ref);
  const map = loadMap();
  const files = build({ from, sha, date, map });

  if (!args.check) {
    writeTree(KIT_ROOT, files);
    console.log(`synced ${files.size} files from ${sha} (${date})`);
    return 0;
  }

  const tmp = checkDir();
  const tree = join(tmp, "tree");
  mkdirSync(tree, { recursive: true });
  writeTree(tree, files);
  let drift = 0;
  for (const rel of [...files.keys()].sort()) {
    const kitFile = join(KIT_ROOT, ...rel.split("/"));
    const synced = join(tree, ...rel.split("/"));
    if (!existsSync(kitFile)) {
      console.log(`only in the sync, missing from the kit: ${rel}`);
      drift += 1;
    } else if (readFileSync(kitFile, "utf8") !== files.get(rel)) {
      process.stdout.write(unifiedDiff(kitFile, synced, rel));
      console.log(`differs: ${rel}`);
      drift += 1;
    }
  }
  if (drift) {
    console.log(`drift: ${drift} of ${files.size} files differ from ${sha} (${date})`);
    return 1;
  }
  console.log(`in step: ${files.size} files match ${sha} (${date})`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (!(e instanceof SyncError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}
