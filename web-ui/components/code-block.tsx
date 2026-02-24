"use client";

import { useEffect, useState } from "react";
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
  const transformers = showLineNumbers ? [lineNumberTransformer] : [];

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
}

export function CodeBlock({ code, language = "text", showLineNumbers = false }: CodeBlockProps) {
  const [lightHtml, setLightHtml] = useState("");
  const [darkHtml, setDarkHtml] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      void highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
        if (!active) {
          return;
        }
        setLightHtml(light);
        setDarkHtml(dark);
      });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timeout);
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
        dangerouslySetInnerHTML={{ __html: lightHtml }}
      />
      <div
        className="hidden overflow-auto pr-12 dark:block [&>pre]:m-0 [&>pre]:bg-transparent! [&>pre]:p-2.5 [&>pre]:text-[11px] sm:[&>pre]:p-3 sm:[&>pre]:text-xs"
        dangerouslySetInnerHTML={{ __html: darkHtml }}
      />
    </div>
  );
}
