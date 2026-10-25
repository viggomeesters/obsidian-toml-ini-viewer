import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const releasePackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
const releaseVersions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const parser = fs.readFileSync("src/parser.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const readme = fs.readFileSync("README.md", "utf8");

const assertions = [
  [manifest.id === "toml-ini-viewer", "manifest id is toml-ini-viewer"],
  [manifest.version === releasePackage.version && /^\d+\.\d+\.\d+$/.test(manifest.version) && releaseVersions[manifest.version] === manifest.minAppVersion, "release version matches package and supported app version"],
  [!/obsidian/i.test(manifest.description), "manifest description avoids product name"],
  [main.includes("registerExtensions(CONFIG_EXTENSIONS"), "extensions are registered"],
  [main.includes("type ViewMode = \"tree\" | \"source\""), "tree/source mode exists"],
  [main.includes("renderTree(container, parsed.root, this.filterValue)"), "tree view code path exists"],
  [main.includes("renderSource(container, this.data)"), "source view code path exists"],
  [parser.includes("NODE_RENDER_LIMIT = 2000"), "render cap exists"],
  [parser.includes("parseToml(data)"), "smol-toml parser is used"],
  [parser.includes("Duplicate key"), "INI duplicate key warnings exist"],
  [!main.includes("navigator.clipboard") && !parser.includes("navigator.clipboard"), "no clipboard access"],
  [!main.includes("fetch(") && !parser.includes("fetch("), "no fetch usage"],
  [!styles.includes("!important"), "styles do not use important overrides"],
  [readme.includes("read-only"), "README documents read-only behavior"],
  [readme.includes("TOML") && readme.includes("INI"), "README documents both formats"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("TOML INI Viewer smoke checks passed.");

