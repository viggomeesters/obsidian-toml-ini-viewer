import { parse as parseToml } from "smol-toml";

const NODE_RENDER_LIMIT = 2000;
const WARNING_RENDER_LIMIT = 50;

export type ConfigMode = "toml" | "ini";
export type ConfigNodeKind = "object" | "array" | "scalar";

export interface WarningItem {
  label: string;
  message: string;
  line?: number;
}

export interface ConfigNode {
  key: string;
  path: string;
  kind: ConfigNodeKind;
  valueType: string;
  valuePreview: string;
  children: ConfigNode[];
}

export interface ParsedConfig {
  mode: ConfigMode;
  root: ConfigNode;
  warnings: WarningItem[];
  errors: WarningItem[];
  totalNodes: number;
  renderedNodes: number;
  skippedNodes: number;
}

interface IniSection {
  name: string;
  values: Record<string, IniValue>;
}

interface IniValue {
  value: string;
  line: number;
}

interface BuildContext {
  totalNodes: number;
  renderedNodes: number;
  skippedNodes: number;
}

export function parseConfig(data: string, extension: string): ParsedConfig {
  const mode = extension.toLowerCase() === "toml" ? "toml" : "ini";
  return mode === "toml" ? parseTomlConfig(data) : parseIniConfig(data);
}

export function visibleWarnings(warnings: WarningItem[]): WarningItem[] {
  return warnings.slice(0, WARNING_RENDER_LIMIT);
}

export function hiddenWarningCount(warnings: WarningItem[]): number {
  return Math.max(0, warnings.length - WARNING_RENDER_LIMIT);
}

function parseTomlConfig(data: string): ParsedConfig {
  const warnings: WarningItem[] = [];
  const errors: WarningItem[] = [];
  let parsed: unknown = {};

  if (data.trim()) {
    try {
      parsed = parseToml(data);
    } catch (error) {
      errors.push({
        label: "TOML parse error",
        message: getErrorMessage(error),
      });
    }
  }

  const built = buildRoot("root", parsed, warnings);
  return {
    mode: "toml",
    root: built.root,
    warnings,
    errors,
    totalNodes: built.context.totalNodes,
    renderedNodes: built.context.renderedNodes,
    skippedNodes: built.context.skippedNodes,
  };
}

function parseIniConfig(data: string): ParsedConfig {
  const warnings: WarningItem[] = [];
  const sections: Record<string, IniSection> = {
    global: { name: "global", values: {} },
  };
  let currentSection = sections.global;

  data.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) return;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      if (!sectionName) {
        warnings.push({
          label: "Empty section",
          line: lineNumber,
          message: "An empty INI section header was ignored.",
        });
        return;
      }

      if (sections[sectionName]) {
        warnings.push({
          label: "Duplicate section",
          line: lineNumber,
          message: `Section [${sectionName}] appears more than once; values are merged.`,
        });
      }

      sections[sectionName] = sections[sectionName] ?? {
        name: sectionName,
        values: {},
      };
      currentSection = sections[sectionName];
      return;
    }

    const separatorIndex = firstSeparatorIndex(line);
    if (separatorIndex < 1) {
      warnings.push({
        label: "Malformed line",
        line: lineNumber,
        message: "Expected a key=value or key:value pair.",
      });
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key) {
      warnings.push({
        label: "Missing key",
        line: lineNumber,
        message: "A key/value pair without a key was ignored.",
      });
      return;
    }

    if (currentSection.values[key]) {
      warnings.push({
        label: "Duplicate key",
        line: lineNumber,
        message: `${formatIniPath(currentSection.name, key)} was overwritten; first seen on line ${currentSection.values[key].line}.`,
      });
    }

    currentSection.values[key] = {
      line: lineNumber,
      value: stripInlineComment(line.slice(separatorIndex + 1).trim()),
    };
  });

  const normalized = normalizeIniSections(sections);
  const built = buildRoot("root", normalized, warnings);
  return {
    mode: "ini",
    root: built.root,
    warnings,
    errors: [],
    totalNodes: built.context.totalNodes,
    renderedNodes: built.context.renderedNodes,
    skippedNodes: built.context.skippedNodes,
  };
}

function buildRoot(key: string, value: unknown, warnings: WarningItem[]): { root: ConfigNode; context: BuildContext } {
  const context: BuildContext = { renderedNodes: 0, skippedNodes: 0, totalNodes: 0 };
  const root = buildNode(key, "", value, context);
  if (context.skippedNodes > 0) {
    warnings.push({
      label: "Render cap",
      message: `${context.skippedNodes} config nodes are not rendered to keep Obsidian responsive.`,
    });
  }
  return { context, root };
}

function buildNode(key: string, path: string, value: unknown, context: BuildContext): ConfigNode {
  context.totalNodes += 1;
  const nodePath = path ? `${path}.${key}` : key;

  if (context.renderedNodes >= NODE_RENDER_LIMIT) {
    context.skippedNodes += 1;
    return {
      key,
      path: nodePath,
      kind: "scalar",
      valueType: "skipped",
      valuePreview: "(not rendered)",
      children: [],
    };
  }

  context.renderedNodes += 1;
  if (Array.isArray(value)) {
    return {
      key,
      path: nodePath,
      kind: "array",
      valueType: "array",
      valuePreview: `${value.length} items`,
      children: value.map((item, index) => buildNode(String(index), nodePath, item, context)).filter((child) => child.valueType !== "skipped"),
    };
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return {
      key,
      path: nodePath,
      kind: "object",
      valueType: "object",
      valuePreview: `${entries.length} keys`,
      children: entries.map(([childKey, childValue]) => buildNode(childKey, nodePath, childValue, context)).filter((child) => child.valueType !== "skipped"),
    };
  }

  return {
    key,
    path: nodePath,
    kind: "scalar",
    valueType: valueType(value),
    valuePreview: formatValuePreview(value),
    children: [],
  };
}

function normalizeIniSections(sections: Record<string, IniSection>): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.values(sections)
      .filter((section) => section.name !== "global" || Object.keys(section.values).length > 0)
      .map((section) => [
        section.name,
        Object.fromEntries(Object.entries(section.values).map(([key, value]) => [key, value.value])),
      ]),
  );
}

function firstSeparatorIndex(line: string): number {
  const equals = line.indexOf("=");
  const colon = line.indexOf(":");
  if (equals === -1) return colon;
  if (colon === -1) return equals;
  return Math.min(equals, colon);
}

function stripInlineComment(value: string): string {
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "\"" || character === "'") && value[index - 1] !== "\\") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (!quote && (character === "#" || character === ";") && /\s/.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trim();
    }
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !(value instanceof Date);
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return "date";
  if (typeof value === "bigint") return "bigint";
  return typeof value;
}

function formatValuePreview(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "symbol") return String(value);
  return JSON.stringify(value) ?? "undefined";
}

function formatIniPath(section: string, key: string): string {
  return section === "global" ? key : `[${section}] ${key}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

