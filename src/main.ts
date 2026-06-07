import {
  Notice,
  Plugin,
  TFile,
  TextFileView,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  ConfigNode,
  ParsedConfig,
  WarningItem,
  hiddenWarningCount,
  parseConfig,
  visibleWarnings,
} from "./parser";

const VIEW_TYPE_TOML_INI_VIEWER = "toml-ini-viewer";
const CONFIG_EXTENSIONS = ["toml", "ini"];

type ViewMode = "tree" | "source";

export default class TomlIniViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_TOML_INI_VIEWER,
      (leaf) => new TomlIniViewerView(leaf),
    );
    this.registerExtensions(CONFIG_EXTENSIONS, VIEW_TYPE_TOML_INI_VIEWER);

    this.addCommand({
      id: "open-current-toml-ini-in-viewer",
      name: "Open current TOML or INI file in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isConfigFile(file)) return false;

        if (!checking) {
          void this.openConfigFile(file);
        }
        return true;
      },
    });
  }

  async openConfigFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_TOML_INI_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class TomlIniViewerView extends TextFileView {
  private mode: ViewMode = "tree";
  private filterValue = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TOML_INI_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "TOML INI viewer";
  }

  getIcon(): string {
    return "braces";
  }

  setViewData(data: string): void {
    this.data = data;
    this.render();
  }

  getViewData(): string {
    return this.data;
  }

  clear(): void {
    this.data = "";
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("toml-ini-viewer");

    const header = container.createDiv({ cls: "toml-ini-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No TOML or INI file is attached to this viewer.");
      return;
    }

    if (!isConfigFile(this.file)) {
      renderMessage(container, "This viewer only supports .toml and .ini files.");
      return;
    }

    const parsed = parseConfig(this.data, this.file.extension);
    renderSummary(container, parsed);
    renderWarnings(container, parsed.errors, "Parse errors", "error");
    renderWarnings(container, parsed.warnings, "Parse warnings", "warning");

    if (!this.data.trim()) {
      renderMessage(container, "This file is empty.");
      return;
    }

    if (this.mode === "source") {
      renderSource(container, this.data);
      return;
    }

    if (parsed.errors.length > 0) {
      renderMessage(container, "Parsed tree is unavailable because the file could not be parsed. Use Source view to inspect the raw file.");
      return;
    }

    renderTree(container, parsed.root, this.filterValue);
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "toml-ini-viewer__title" });
    title.createDiv({
      cls: "toml-ini-viewer__filename",
      text: this.file?.name ?? "TOML or INI file",
    });
    title.createDiv({
      cls: "toml-ini-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "toml-ini-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "toml-ini-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "toml-ini-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Filter config tree",
        placeholder: "Filter",
        spellcheck: "false",
        type: "search",
        value: this.filterValue,
      },
    });
    searchInput.addEventListener("input", () => {
      this.filterValue = searchInput.value;
      this.render();
    });

    const modeGroup = toolbar.createDiv({
      cls: "toml-ini-viewer__segmented",
      attr: { "aria-label": "View mode" },
    });
    const treeButton = createTextButton(modeGroup, "Parsed");
    const sourceButton = createTextButton(modeGroup, "Source");
    treeButton.toggleClass("is-active", this.mode === "tree");
    sourceButton.toggleClass("is-active", this.mode === "source");

    treeButton.addEventListener("click", () => {
      this.mode = "tree";
      this.render();
    });
    sourceButton.addEventListener("click", () => {
      this.mode = "source";
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh file");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No TOML or INI file to refresh");
      return;
    }

    try {
      this.data = await this.app.vault.read(this.file);
      this.render();
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.addClass("toml-ini-viewer");
      renderMessage(this.contentEl, `Unable to read file: ${getErrorMessage(error)}`);
    }
  }
}

function renderSummary(parent: HTMLElement, parsed: ParsedConfig): void {
  const summary = parent.createDiv({ cls: "toml-ini-viewer__summary" });
  summary.createSpan({
    cls: "toml-ini-viewer__pill",
    text: parsed.mode.toUpperCase(),
  });
  summary.createSpan({
    cls: "toml-ini-viewer__pill",
    text: `${parsed.totalNodes} nodes`,
  });
  if (parsed.skippedNodes > 0) {
    summary.createSpan({
      cls: "toml-ini-viewer__note",
      text: `${parsed.renderedNodes} nodes rendered`,
    });
  }
}

function renderWarnings(parent: HTMLElement, warnings: WarningItem[], title: string, tone: "error" | "warning"): void {
  if (warnings.length === 0) return;

  const box = parent.createDiv({ cls: `toml-ini-viewer__warnings toml-ini-viewer__warnings--${tone}` });
  box.createDiv({ cls: "toml-ini-viewer__warnings-title", text: title });
  visibleWarnings(warnings).forEach((warning) => {
    const location = warning.line ? `Line ${warning.line}: ` : "";
    box.createDiv({
      cls: "toml-ini-viewer__warning",
      text: `${location}${warning.label}: ${warning.message}`,
    });
  });

  const hiddenCount = hiddenWarningCount(warnings);
  if (hiddenCount > 0) {
    box.createDiv({
      cls: "toml-ini-viewer__warning-more",
      text: `${hiddenCount} additional warnings hidden`,
    });
  }
}

function renderTree(parent: HTMLElement, root: ConfigNode, query: string): void {
  const tree = parent.createDiv({ cls: "toml-ini-viewer__tree" });
  const normalizedQuery = query.trim().toLowerCase();
  const rendered = renderNode(tree, root, normalizedQuery, 0, true);
  if (!rendered) {
    renderMessage(parent, "No config entries match the current filter.");
  }
}

function renderNode(parent: HTMLElement, node: ConfigNode, query: string, depth: number, forceOpen: boolean): boolean {
  const children = node.children.filter((child) => nodeMatches(child, query));
  const selfMatches = nodeMatchesSelf(node, query);
  if (query && !selfMatches && children.length === 0) return false;

  const item = parent.createEl("details", {
    cls: `toml-ini-viewer__node toml-ini-viewer__node--${node.kind}`,
    attr: { "data-path": node.path },
  });
  item.open = forceOpen || Boolean(query) || depth < 2;
  item.style.setProperty("--toml-ini-viewer-depth", String(depth));

  const summary = item.createEl("summary", { cls: "toml-ini-viewer__node-summary" });
  summary.createSpan({ cls: "toml-ini-viewer__node-key", text: node.key });
  summary.createSpan({ cls: "toml-ini-viewer__node-type", text: node.valueType });
  if (node.valuePreview) {
    summary.createSpan({ cls: "toml-ini-viewer__node-value", text: node.valuePreview });
  }

  if (node.children.length > 0) {
    const childList = item.createDiv({ cls: "toml-ini-viewer__children" });
    node.children.forEach((child) => {
      renderNode(childList, child, query, depth + 1, false);
    });
  }

  return true;
}

function nodeMatches(node: ConfigNode, query: string): boolean {
  if (!query) return true;
  return nodeMatchesSelf(node, query) || node.children.some((child) => nodeMatches(child, query));
}

function nodeMatchesSelf(node: ConfigNode, query: string): boolean {
  if (!query) return true;
  return [node.key, node.path, node.valueType, node.valuePreview].some((value) => value.toLowerCase().includes(query));
}

function renderSource(parent: HTMLElement, data: string): void {
  const source = parent.createDiv({ cls: "toml-ini-viewer__source" });
  const pre = source.createEl("pre");
  data.split(/\r?\n/).forEach((line, index) => {
    const lineEl = pre.createDiv({ cls: "toml-ini-viewer__source-line" });
    lineEl.createSpan({ cls: "toml-ini-viewer__line-number", text: String(index + 1) });
    const code = lineEl.createSpan({ cls: "toml-ini-viewer__source-code" });
    renderSourceLine(code, line);
  });
}

function renderSourceLine(parent: HTMLElement, line: string): void {
  const trimmed = line.trimStart();
  const leading = line.length - trimmed.length;
  if (leading > 0) parent.createSpan({ text: line.slice(0, leading) });

  if (!trimmed) return;
  if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
    parent.createSpan({ cls: "toml-ini-viewer__token toml-ini-viewer__token--comment", text: trimmed });
    return;
  }

  const sectionMatch = trimmed.match(/^(\[[^\]]+\])(.*)$/);
  if (sectionMatch) {
    parent.createSpan({ cls: "toml-ini-viewer__token toml-ini-viewer__token--section", text: sectionMatch[1] });
    parent.createSpan({ text: sectionMatch[2] });
    return;
  }

  const separatorIndex = firstSeparatorIndex(trimmed);
  if (separatorIndex > 0) {
    parent.createSpan({ cls: "toml-ini-viewer__token toml-ini-viewer__token--key", text: trimmed.slice(0, separatorIndex) });
    parent.createSpan({ cls: "toml-ini-viewer__token toml-ini-viewer__token--separator", text: trimmed[separatorIndex] });
    parent.createSpan({ cls: "toml-ini-viewer__token toml-ini-viewer__token--value", text: trimmed.slice(separatorIndex + 1) });
    return;
  }

  parent.createSpan({ text: trimmed });
}

function createTextButton(parent: HTMLElement, label: string): HTMLButtonElement {
  return parent.createEl("button", {
    cls: "toml-ini-viewer__button",
    text: label,
    attr: { type: "button" },
  });
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "toml-ini-viewer__icon-button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "toml-ini-viewer__message", text: message });
}

function firstSeparatorIndex(line: string): number {
  const equals = line.indexOf("=");
  const colon = line.indexOf(":");
  if (equals === -1) return colon;
  if (colon === -1) return equals;
  return Math.min(equals, colon);
}

function isConfigFile(file: TFile | null): file is TFile {
  return Boolean(file && CONFIG_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

