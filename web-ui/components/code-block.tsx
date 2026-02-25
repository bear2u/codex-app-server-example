"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  bundledLanguages,
  codeToHtml,
  type BundledLanguage,
  type BundledTheme,
  type ShikiTransformer,
} from "shiki";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

const MAX_HIGHLIGHT_CACHE_ENTRIES = 200;
const highlightCache = new Map<string, [string, string]>();
const inFlightHighlights = new Map<string, Promise<[string, string]>>();

// Highlight job queue management
const pendingHighlights: Array<() => void> = [];
let isProcessingQueue = false;

function processHighlightQueue() {
  if (isProcessingQueue || pendingHighlights.length === 0) {
    return;
  }
  isProcessingQueue = true;

  // Process one task at a time to avoid blocking the main thread
  const task = pendingHighlights.shift();
  if (task) {
    task();
  }

  // Defer the next task with requestAnimationFrame
  requestAnimationFrame(() => {
    isProcessingQueue = false;
    if (pendingHighlights.length > 0) {
      processHighlightQueue();
    }
  });
}

function scheduleHighlight(task: () => void) {
  pendingHighlights.push(task);
  processHighlightQueue();
}

const lineNumberTransformer: ShikiTransformer = {
  name: "line-numbers",
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "inline-block",
          "min-w-8",
          "mr-4",
          "text-right",
          "select-none",
          "text-[#1c7f79]/60",
        ],
      },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

const FALLBACK_LANGUAGE: BundledLanguage = "bash";
const LIGHT_THEME: BundledTheme = "everforest-light";
const DARK_THEME: BundledTheme = "everforest-dark";

function normalizeLanguage(language?: string): BundledLanguage {
  const normalized = language?.trim().toLowerCase();
  if (normalized && normalized in bundledLanguages) {
    return normalized as BundledLanguage;
  }
  return FALLBACK_LANGUAGE;
}

async function highlightCode(
  code: string,
  language?: string,
  showLineNumbers = false,
): Promise<[string, string]> {
  const lang = normalizeLanguage(language);
  const cacheKey = `${lang}|${showLineNumbers ? "lines" : "plain"}|${code}`;
  const cached = highlightCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightHighlights.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const transformers = showLineNumbers ? [lineNumberTransformer] : [];

  const job = (async () => {
    try {
      return await Promise.all([
        codeToHtml(code, { lang, theme: LIGHT_THEME, transformers }),
        codeToHtml(code, { lang, theme: DARK_THEME, transformers }),
      ]);
    } catch {
      return await Promise.all([
        codeToHtml(code, { lang: FALLBACK_LANGUAGE, theme: LIGHT_THEME, transformers }),
        codeToHtml(code, { lang: FALLBACK_LANGUAGE, theme: DARK_THEME, transformers }),
      ]);
    }
  })();

  inFlightHighlights.set(cacheKey, job);
  const result = await job;
  inFlightHighlights.delete(cacheKey);
  highlightCache.set(cacheKey, result);
  if (highlightCache.size > MAX_HIGHLIGHT_CACHE_ENTRIES) {
    const oldestKey = highlightCache.keys().next().value;
    if (oldestKey) {
      highlightCache.delete(oldestKey);
    }
  }
  return result;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
}: CodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<{ light: string; dark: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const highlightRequestedRef = useRef(false);

  useEffect(() => {
    highlightRequestedRef.current = true;

    // Check cached result first (sync)
    const lang = normalizeLanguage(language);
    const cacheKey = `${lang}|${showLineNumbers ? "lines" : "plain"}|${code}`;
    const cached = highlightCache.get(cacheKey);

    if (cached) {
      setHighlightedHtml({ light: cached[0], dark: cached[1] });
      return;
    }

    // Schedule highlight work in the queue
    scheduleHighlight(() => {
      if (!highlightRequestedRef.current) {
        return;
      }

      void highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
        if (!highlightRequestedRef.current) {
          return;
        }
        // Apply state update once the highlight job is done
        setHighlightedHtml({ light, dark });
      });
    });

    return () => {
      highlightRequestedRef.current = false;
    };
  }, [code, language, showLineNumbers]);

  const copyCode = async () => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Render plain text before highlighted HTML is ready
  if (!highlightedHtml) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-[#9ecfcb] bg-[#ecf8f7]">
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={() => void copyCode()}
            className="rounded-md border border-[#9ecfcb] bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#1c7f79] transition-colors hover:bg-[#dff2f0]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="m-0 overflow-auto bg-transparent p-2.5 pr-12 text-[11px] sm:p-3 sm:text-xs">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#9ecfcb] bg-[#ecf8f7]">
      <div className="absolute right-2 top-2 z-10">
        <button
          type="button"
          onClick={() => void copyCode()}
          className="rounded-md border border-[#9ecfcb] bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#1c7f79] transition-colors hover:bg-[#dff2f0]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div
        className="overflow-auto pr-12 dark:hidden [&>pre]:m-0 [&>pre]:bg-transparent! [&>pre]:p-2.5 [&>pre]:text-[11px] sm:[&>pre]:p-3 sm:[&>pre]:text-xs"
        dangerouslySetInnerHTML={{ __html: highlightedHtml.light }}
      />
      <div
        className="hidden overflow-auto pr-12 dark:block [&>pre]:m-0 [&>pre]:bg-transparent! [&>pre]:p-2.5 [&>pre]:text-[11px] sm:[&>pre]:p-3 sm:[&>pre]:text-xs"
        dangerouslySetInnerHTML={{ __html: highlightedHtml.dark }}
      />
    </div>
  );
});
