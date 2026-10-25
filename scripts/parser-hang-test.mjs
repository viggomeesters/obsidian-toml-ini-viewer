import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import esbuild from "esbuild";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "toml-parser-regression-"));
try {
  const output = path.join(temporary, "parser.mjs");
  await esbuild.build({ entryPoints: ["src/parser.ts"], outfile: output, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  for (const [input, expectedErrors] of [["a=1", 0], ["a=[1 #", 1], ["a={b=1 #", 1]]) {
    const script = `import {parseConfig} from ${JSON.stringify(pathToFileURL(output).href)}; process.stdout.write(JSON.stringify(parseConfig(${JSON.stringify(input)}, 'toml')));`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 2000, encoding: "utf8", maxBuffer: 1024 * 1024 });
    assert.equal(child.error?.code, undefined, `Parser must terminate for ${JSON.stringify(input)}: ${child.error?.message}`);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).errors.length, expectedErrors);
  }
  console.log("Malformed TOML terminates within the subprocess deadline.");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
