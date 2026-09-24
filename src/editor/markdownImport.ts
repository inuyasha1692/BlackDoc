import { marked } from "marked";
import type { BlackDocBlock, BlackDocEditor } from "./schema";
import { createSplitPane, SPLIT_AUTO_HEIGHT } from "./splitPane";

export interface MarkdownImportResult {
  blocks: BlackDocBlock[];
  warnings: string[];
}

const ANCHOR_TAG = /<span\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
const MARKER = "BLACKDOCIMPORTANCHOR";
const IMAGE_MARKER = "BLACKDOCIMPORTIMAGE";
const VIDEO_MARKER = "BLACKDOCIMPORTVIDEO";
const SOURCE_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img\b[^>]*>/gi;
const EMBEDDED_VIDEO = /\[([^\]]+)\]\((data:video\/mp4;base64,[^)]+)\)/gi;
type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const visit = (value: unknown, action: (object: JsonObject) => void): void => {
  if (Array.isArray(value)) {
    value.forEach(item => visit(item, action));
  } else if (isObject(value)) {
    action(value);
    Object.values(value).forEach(item => visit(item, action));
  }
};

const plainText = (value: unknown): string => {
  let result = "";
  visit(value, object => {
    if (typeof object.text === "string") result += object.text;
  });
  return result;
};

const paletteColor = (value: string, kind: "textColor" | "backgroundColor"): string => {
  if (["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"].includes(value)) return value;
  const hex = value.match(/^#([\da-f]{6})$/i);
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  const channels = hex
    ? [0, 2, 4].map(offset => parseInt(hex[1].slice(offset, offset + 2), 16))
    : rgb ? rgb.slice(1, 4).map(Number) : null;
  if (!channels) return value;
  const [red, green, blue] = channels.map(channel => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (kind === "textColor" && max < 0.18) return "default";
  if (kind === "backgroundColor" && min > 0.97) return "default";
  if (delta < 0.08) return "gray";
  const hue = (max === red ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4) * 60;
  const degrees = (hue + 360) % 360;
  if (degrees < 15 || degrees >= 345) return "red";
  if (degrees < 45) return "orange";
  if (degrees < 75) return "yellow";
  if (degrees < 165) return "green";
  if (degrees < 255) return "blue";
  if (degrees < 300) return "purple";
  return "pink";
};

const imageDescriptionPanes = (blocks: BlackDocBlock[]): BlackDocBlock[] => blocks.flatMap(block => {
  if (block.type !== "table" || block.content.type !== "tableContent") return [block];
  const rows = block.content.rows;
  if (rows.length === 0 || rows.some(row => row.cells.length !== rows[0].cells.length)) return [block];
  const columnCount = rows[0].cells.length;
  if (columnCount < 2 || columnCount > 4) return [block];
  const header = rows[0].cells.map(cell => plainText(cell).trim());
  if (["状态", "图片", "说明"].every(label => header.includes(label))) return [block];
  const isImageDescription = columnCount === 2 && header[0] === "图片" && header[1] === "说明";
  const firstRow = isImageDescription ? 1 :
    block.content.headerRows && !header.some(text => text.includes(IMAGE_MARKER)) ? 1 : 0;
  const contentRows = rows.slice(firstRow);
  if (!contentRows.length || contentRows.some(row =>
    !row.cells.some(cell => plainText(cell).includes(IMAGE_MARKER)) ||
    !row.cells.some(cell => plainText(cell).replace(/BLACKDOCIMPORTIMAGE\d+END/g, "").trim()))) return [block];
  const cellContent = (cell: unknown) =>
    isObject(cell) && Array.isArray(cell.content) ? cell.content : cell;
  if (columnCount === 2 && contentRows.every(row =>
    plainText(row.cells[0]).includes(IMAGE_MARKER))) {
    return contentRows.map(row => ({
      ...createSplitPane(), id: crypto.randomUUID(),
      props: { leftWidth: 50, rightHeight: SPLIT_AUTO_HEIGHT },
      children: row.cells.map((cell, index) => ({
        id: crypto.randomUUID(), type: "splitColumn", props: { side: index === 0 ? "left" : "right" },
        children: [{ id: crypto.randomUUID(), type: "paragraph", content: cellContent(cell), children: [] }],
      })),
    } as unknown as BlackDocBlock));
  }
  const displayRows = firstRow === 1 ? rows : contentRows;
  return displayRows.map(row => ({
    id: crypto.randomUUID(), type: "columnList", props: {},
    children: row.cells.map(cell => ({
      id: crypto.randomUUID(), type: "column", props: { width: 1 },
      children: [{ id: crypto.randomUUID(), type: "paragraph", content: cellContent(cell), children: [] }],
    })),
  } as unknown as BlackDocBlock));
});

interface EmbeddedImage {
  url: string;
  name: string;
  previewWidth?: number;
}

interface EmbeddedVideo {
  url: string;
  name: string;
}

const maskAssets = (markdown: string): {
  markdown: string;
  images: EmbeddedImage[];
  videos: EmbeddedVideo[];
} => {
  const images: EmbeddedImage[] = [];
  const videos: EmbeddedVideo[] = [];
  let inFence = false;
  const lines = markdown.split("\n").map(line => {
    if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return line;
    const withoutImages = line.replace(SOURCE_IMAGE, (match, alt: string | undefined, url: string | undefined) => {
      const imageUrl = url ?? match.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!imageUrl) return match;
      const name = alt ?? match.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
      const width = match.match(/(?:max-width\s*:\s*|\bwidth\s*=\s*["']?)(\d+)px?/i)?.[1];
      const index = images.push({
        url: imageUrl,
        name,
        previewWidth: width ? Number(width) : undefined,
      }) - 1;
      return `${IMAGE_MARKER}${index}END`;
    });
    return withoutImages.replace(EMBEDDED_VIDEO, (_match, name: string, url: string) => {
      const index = videos.push({ name, url }) - 1;
      return `${name} ${VIDEO_MARKER}${index}END`;
    });
  });
  return { markdown: lines.join("\n"), images, videos };
};

const isListItem = (block: BlackDocBlock): boolean =>
  block.type === "bulletListItem" || block.type === "numberedListItem" ||
  block.type === "checkListItem";

// BlockNote flattens some Markdown lists when a parent item has its own paragraph.
// Use the source list tree for depth, but retain BlockNote's blocks and inline formatting.
const restoreListDepths = (markdown: string, blocks: BlackDocBlock[]): BlackDocBlock[] => {
  const sourceItems: { depth: number; label: string }[] = [];
  const label = (text: string) => {
    const firstLine = text.split(/\n|<br\s*\/?>/i)[0];
    const html = new DOMParser().parseFromString(firstLine, "text/html").body.textContent ?? "";
    return html.replace(/\\([\\`*_{}[\]()#+.!<>-])/g, "$1")
      .replace(/[*_`~\s]/g, "").toLowerCase();
  };
  const scan = (tokens: ReturnType<typeof marked.lexer>, depth: number) => {
    for (const token of tokens) {
      if (token.type === "list") {
        for (const item of token.items) {
          sourceItems.push({ depth, label: label(item.text) });
          scan(item.tokens as ReturnType<typeof marked.lexer>, depth + 1);
        }
      } else if ("tokens" in token && Array.isArray(token.tokens)) {
        scan(token.tokens as ReturnType<typeof marked.lexer>, depth);
      }
    }
  };
  scan(marked.lexer(markdown), 0);
  if (!sourceItems.some(item => item.depth > 0)) return blocks;

  const parsedItems: BlackDocBlock[] = [];
  const collect = (items: BlackDocBlock[]) => {
    for (const block of items) {
      if (isListItem(block)) parsedItems.push(block);
      collect(block.children);
    }
  };
  collect(blocks);
  const parsedLabels = parsedItems.map(block => label(plainText(block.content)));
  const score = (source: string, parsed: string): number => {
    if (!source || !parsed) return 0;
    if (source === parsed) return 3;
    if (source.length >= 4 && parsed.length >= 4 &&
      (source.startsWith(parsed) || parsed.startsWith(source))) return 2;
    return 0;
  };
  // Align by content rather than position: BlockNote can create an extra empty list item.
  const table = Array.from({ length: sourceItems.length + 1 },
    () => Array<number>(parsedItems.length + 1).fill(0));
  for (let i = sourceItems.length - 1; i >= 0; i--) {
    for (let j = parsedItems.length - 1; j >= 0; j--) {
      table[i][j] = Math.max(table[i + 1][j], table[i][j + 1],
        score(sourceItems[i].label, parsedLabels[j]) + table[i + 1][j + 1]);
    }
  }
  const depths = new Map<string, number>();
  let i = 0;
  let j = 0;
  while (i < sourceItems.length && j < parsedItems.length) {
    const matched = score(sourceItems[i].label, parsedLabels[j]);
    if (matched && table[i][j] === matched + table[i + 1][j + 1]) {
      depths.set(parsedItems[j].id, sourceItems[i].depth);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const rebuild = (items: BlackDocBlock[], parentDepth = -1): BlackDocBlock[] => {
    const result: BlackDocBlock[] = [];
    const parents = new Map<number, BlackDocBlock>();
    for (const original of items) {
      const block = original.children.length
        ? { ...original, children: rebuild(original.children, depths.get(original.id) ?? parentDepth) }
        : original;
      const depth = depths.get(block.id);
      if (depth === undefined || !isListItem(block)) {
        result.push(block);
        parents.clear();
        continue;
      }
      for (const level of [...parents.keys()]) {
        if (level >= depth) parents.delete(level);
      }
      const parent = parents.get(depth - 1);
      if (depth > parentDepth + 1 && parent) {
        parent.children.push(block);
      } else {
        result.push(block);
      }
      parents.set(depth, block);
    }
    return result;
  };
  return rebuild(blocks);
};

export const importMarkdownBlocks = (
  editor: BlackDocEditor,
  markdown: string,
): MarkdownImportResult => {
  const anchors: string[] = [];
  const anchorHints: string[] = [];
  const masked = maskAssets(markdown);
  const normalized = masked.markdown
    .replace(/<br\s*$/gim, "<br>")
    .replace(ANCHOR_TAG, (tag, id: string, offset: number, source: string) => {
      const index = anchors.push(id) - 1;
      anchorHints[index] = source.slice(offset + tag.length, offset + tag.length + 260)
        .replace(/<[^>]*>/g, " ")
        .replace(/(?:BLACKDOCIMPORTIMAGE|BLACKDOCIMPORTVIDEO)\d+END/g, " ")
        .replace(/[*_#|[\]()>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 18);
      return `${MARKER}${index}END${tag}`;
    });
  const parsed = restoreListDepths(normalized,
    imageDescriptionPanes(editor.tryParseMarkdownToBlocks(normalized)));
  if (parsed.length === 0) {
    throw new Error("Markdown 文档没有可导入的内容。");
  }

  const anchorBlocks = new Map<string, string>();
  const markerPattern = new RegExp(`${MARKER}(\\d+)END`, "g");
  const emptyAnchorBlocks = new Set<string>();
  const flatten = (items: BlackDocBlock[]): BlackDocBlock[] => items.flatMap(block =>
    [block, ...flatten(block.children)]);
  const anchorSources = flatten(parsed).filter(block =>
    block.type !== "splitPane" && block.type !== "splitColumn" &&
    block.type !== "columnList" && block.type !== "column");
  for (const [index, block] of anchorSources.entries()) {
    if (block.type === "heading") {
      const title = plainText(block.content).trim();
      if (title) anchorBlocks.set(title, block.id);
    }
    const onlyAnchor = block.type === "paragraph" &&
      plainText(block.content).replace(markerPattern, "").trim() === "" &&
      plainText(block.content).includes(MARKER);
    const targetId = onlyAnchor && anchorSources[index + 1] ? anchorSources[index + 1].id : block.id;
    visit(block.content, object => {
      if (typeof object.text !== "string" || !object.text.includes(MARKER)) return;
      object.text = object.text.replace(markerPattern, (_marker, number: string) => {
        const anchor = anchors[Number(number)];
        if (anchor) anchorBlocks.set(anchor, targetId);
        return "";
      });
    });
    if (onlyAnchor && anchorSources[index + 1]) emptyAnchorBlocks.add(block.id);
  }

  const warnings: string[] = [];
  const removeEmptyAnchors = (items: BlackDocBlock[]): BlackDocBlock[] => items
    .filter(block => !emptyAnchorBlocks.has(block.id))
    .map(block => block.children.length
      ? { ...block, children: removeEmptyAnchors(block.children) } : block);
  const blocks = removeEmptyAnchors(parsed);
  const searchableBlocks = anchorSources.filter(block => !emptyAnchorBlocks.has(block.id));
  const blockTexts = searchableBlocks.map(block => plainText(block).replace(/\s+/g, " "));
  for (const [index, anchor] of anchors.entries()) {
    if (anchorBlocks.has(anchor) || !anchorHints[index]) continue;
    const hint = anchorHints[index];
    const matches = searchableBlocks.filter((_block, blockIndex) =>
      blockTexts[blockIndex].includes(hint));
    if (matches.length === 0) {
      matches.push(...searchableBlocks.filter((_block, blockIndex) =>
        blockTexts[blockIndex].includes(hint.slice(0, 8))));
    }
    const target = matches.find(block => block.type !== "table") ?? matches.at(-1);
    if (target) anchorBlocks.set(anchor, target.id);
  }
  const imagePattern = new RegExp(`${IMAGE_MARKER}(\\d+)END`, "g");
  const videoPattern = new RegExp(`${VIDEO_MARKER}(\\d+)END`, "g");
  const placedImages = new Set<number>();
  const placedVideos = new Set<number>();
  const withImages: BlackDocBlock[] = [];
  const imageBlock = (index: number): BlackDocBlock | null => {
    const source = masked.images[index];
    if (!source) return null;
    const image = editor.tryParseMarkdownToBlocks(`![${source.name}](${source.url})`)
      .find(item => item.type === "image");
    if (!image) {
      warnings.push(`图片 ${source.name || index + 1} 未能转换为图片块。`);
      return null;
    }
    placedImages.add(index);
    return source.previewWidth
      ? { ...image, props: { ...image.props, previewWidth: source.previewWidth } }
      : image;
  };
  const embedTableImages = (block: BlackDocBlock): void => {
    visit(block, object => {
      if (object.type !== "tableCell" || !Array.isArray(object.content)) return;
      object.content = object.content.flatMap((item: unknown) => {
        if (!isObject(item) || item.type !== "text" || typeof item.text !== "string" ||
          !item.text.includes(IMAGE_MARKER)) return [item];
        const inline: unknown[] = [];
        let start = 0;
        for (const match of item.text.matchAll(imagePattern)) {
          if (match.index > start) inline.push({ ...item, text: item.text.slice(start, match.index) });
          const index = Number(match[1]);
          const source = masked.images[index];
          if (source) {
            placedImages.add(index);
            inline.push({
              type: "tableImage",
              props: { url: source.url, name: source.name, previewWidth: source.previewWidth ?? 0 },
            });
          }
          start = match.index + match[0].length;
        }
        if (start < item.text.length) inline.push({ ...item, text: item.text.slice(start) });
        return inline;
      });
    });
  };
  const expandTextImages = (block: BlackDocBlock): BlackDocBlock[] => {
    const children = block.children.flatMap(expandTextImages);
    const isListItem = block.type === "bulletListItem" ||
      block.type === "numberedListItem" || block.type === "checkListItem";
    if ((block.type !== "paragraph" && !isListItem) || !Array.isArray(block.content)) {
      return [{ ...block, children }];
    }
    const expanded: BlackDocBlock[] = [];
    let pending: typeof block.content = [];
    let seenImage = false;
    let stripNextBreak = false;
    const flush = () => {
      if (pending.some(item => item.type !== "text" || item.text.trim())) {
        const id = isListItem || expanded.length ? crypto.randomUUID() : block.id;
        expanded.push(isListItem ? {
          id, type: "paragraph",
          props: {
            backgroundColor: block.props.backgroundColor,
            textColor: block.props.textColor,
            textAlignment: block.props.textAlignment,
          },
          content: pending, children: [],
        } as BlackDocBlock : { ...block, id, content: pending, children: [] });
      }
      pending = [];
    };
    const trimLastBreak = () => {
      const last = pending.at(-1);
      if (last?.type !== "text") return;
      const text = last.text.replace(/\r?\n[ \t]*$/, "");
      if (text === last.text) return;
      if (text) pending[pending.length - 1] = { ...last, text };
      else pending.pop();
    };
    const addText = (item: Extract<typeof block.content[number], { type: "text" }>, value: string) => {
      const text = stripNextBreak ? value.replace(/^[ \t]*\r?\n[ \t]*/, "") : value;
      if (text) {
        pending.push({ ...item, text });
        stripNextBreak = false;
      }
    };
    for (const item of block.content) {
      if (item.type !== "text") {
        pending.push(item);
        stripNextBreak = false;
        continue;
      }
      if (!item.text.includes(IMAGE_MARKER)) {
        addText(item, item.text);
        continue;
      }
      let start = 0;
      for (const match of item.text.matchAll(imagePattern)) {
        addText(item, item.text.slice(start, match.index));
        trimLastBreak();
        flush();
        const image = imageBlock(Number(match[1]));
        if (image) {
          expanded.push({ ...image, id: isListItem || expanded.length ? image.id : block.id });
          seenImage = true;
        } else {
          pending.push({ ...item, text: match[0] });
        }
        stripNextBreak = true;
        start = match.index + match[0].length;
      }
      addText(item, item.text.slice(start));
    }
    if (!seenImage) return [{ ...block, children }];
    flush();
    if (isListItem) {
      const first = expanded[0];
      const leadingText = first?.type === "paragraph" ? first : null;
      return [{
        ...block,
        content: leadingText ? leadingText.content : [],
        children: [...expanded.slice(leadingText ? 1 : 0), ...children],
      }];
    }
    if (children.length) {
      const last = expanded.at(-1);
      if (last?.type === "paragraph") last.children = children;
      else expanded.push({ ...block, id: crypto.randomUUID(), content: [], children });
    }
    return expanded;
  };
  for (const block of blocks.flatMap(expandTextImages)) {
    embedTableImages(block);
    if (block.type === "splitPane" || block.type === "columnList") {
      withImages.push(block);
      continue;
    }
    const indexes: number[] = [];
    const videoIndexes: number[] = [];
    visit(block, object => {
      if (typeof object.text !== "string") return;
      object.text = object.text.replace(imagePattern, (_marker, number: string) => {
        indexes.push(Number(number));
        const image = masked.images[Number(number)];
        return image?.name ? `【图片：${image.name}】` : "【图片】";
      }).replace(videoPattern, (_marker, number: string) => {
        videoIndexes.push(Number(number));
        return "";
      });
    });
    withImages.push(block);
    for (const index of indexes) {
      if (placedImages.has(index)) continue;
      const image = imageBlock(index);
      if (image) withImages.push(image);
    }
    for (const index of videoIndexes) {
      const video = masked.videos[index];
      if (!video || placedVideos.has(index)) continue;
      placedVideos.add(index);
      const parsedVideo = editor.tryParseHTMLToBlocks(`<video src="${video.url}" controls></video>`);
      if (parsedVideo.some(item => item.type === "video")) {
        withImages.push(...parsedVideo);
      } else {
        warnings.push(`视频 ${video.name} 未能转换为视频块。`);
      }
    }
  }
  if (placedImages.size !== masked.images.length) {
    warnings.push(`${masked.images.length - placedImages.size} 张图片未能定位到导入后的内容。`);
  }
  if (placedVideos.size !== masked.videos.length) {
    warnings.push(`${masked.videos.length - placedVideos.size} 个视频未能定位到导入后的内容。`);
  }
  const unresolvedLinks: string[] = [];
  for (const block of withImages) {
    visit(block, object => {
      if (isObject(object.styles)) {
        for (const kind of ["textColor", "backgroundColor"] as const) {
          if (typeof object.styles[kind] === "string") {
            object.styles[kind] = paletteColor(object.styles[kind], kind);
          }
        }
      }
      if (typeof object.href !== "string" || !object.href.startsWith("#") ||
        object.href.startsWith("#block=")) return;
      let fragment: string;
      try {
        fragment = decodeURIComponent(object.href.slice(1));
      } catch {
        fragment = object.href.slice(1);
      }
      const target = anchorBlocks.get(fragment);
      if (target) object.href = `#block=${encodeURIComponent(target)}`;
      else unresolvedLinks.push(`“${plainText(object.content) || "未命名链接"}” → ${object.href}`);
    });
  }
  const unresolved = anchors.filter(anchor => !anchorBlocks.has(anchor));
  if (unresolved.length > 0) {
    warnings.push(`${unresolved.length} 个自定义锚点未能定位到导入后的内容：${unresolved.join("、")}`);
  }
  if (unresolvedLinks.length > 0) {
    warnings.push(`${unresolvedLinks.length} 个文内链接未能定位：${unresolvedLinks.join("；")}`);
  }
  return { blocks: withImages, warnings };
};
