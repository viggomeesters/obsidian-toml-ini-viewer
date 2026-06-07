import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const { parseConfig } = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));

function readFixture(name) {
  return fs.readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8");
}

const validToml = parseConfig(readFixture("valid.toml"), "toml");
assert.equal(validToml.mode, "toml");
assert.equal(validToml.errors.length, 0);
assert.ok(validToml.totalNodes > 8);
assert.ok(validToml.root.children.some((node) => node.key === "database"));
assert.ok(JSON.stringify(validToml.root).includes("credentials"));

const invalidToml = parseConfig(readFixture("invalid.toml"), "toml");
assert.equal(invalidToml.mode, "toml");
assert.equal(invalidToml.errors.length, 1);
assert.equal(invalidToml.root.children.length, 0);

const validIni = parseConfig(readFixture("valid.ini"), "ini");
assert.equal(validIni.mode, "ini");
assert.equal(validIni.errors.length, 0);
assert.ok(validIni.root.children.some((node) => node.key === "global"));
assert.ok(JSON.stringify(validIni.root).includes("server"));
assert.ok(JSON.stringify(validIni.root).includes("value # not a comment"));

const ambiguousIni = parseConfig(readFixture("ambiguous.ini"), "ini");
assert.equal(ambiguousIni.errors.length, 0);
assert.ok(ambiguousIni.warnings.some((warning) => warning.label === "Duplicate key"));
assert.ok(ambiguousIni.warnings.some((warning) => warning.label === "Duplicate section"));
assert.ok(ambiguousIni.warnings.some((warning) => warning.label === "Malformed line"));
assert.ok(JSON.stringify(ambiguousIni.root).includes("127.0.0.1"));

const emptyToml = parseConfig(readFixture("empty.toml"), "toml");
assert.equal(emptyToml.errors.length, 0);
assert.equal(emptyToml.totalNodes, 1);

const largeToml = Array.from({ length: 2205 }, (_, index) => `key_${index} = "${index}"`).join("\n");
const large = parseConfig(largeToml, "toml");
assert.ok(large.skippedNodes > 0);
assert.ok(large.warnings.some((warning) => warning.label === "Render cap"));

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("TOML INI parser fixture tests passed.");

