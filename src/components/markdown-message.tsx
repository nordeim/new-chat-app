"use client";

import { memo, useDeferredValue, useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { getNodeText } from "@/lib/markdown";

function CodeBlock({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const codeText = getNodeText(children).replace(/\n$/, "");

  useEffect(
    () => () => clearTimeout(copiedTimer.current),
    [],
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be missing in insecure contexts; the pre remains selectable.
    }
  }

  return (
    <div className="code-block">
      <button
        type="button"
        className="code-copy"
        aria-label={copied ? "Copied code" : "Copy code"}
        onClick={() => void copyCode()}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre {...props}>{children}</pre>
    </div>
  );
}

// Memoized: props are primitives, so completed messages skip the remark +
// rehype-highlight re-parse on every streaming render of the parent.
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const deferred = useDeferredValue(content);
  const shown = streaming ? deferred : content;
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={
          {
            pre: CodeBlock,
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            img: ({ alt }) => <span>[Image: {alt ?? "image"}]</span>,
          } satisfies Components
        }
      >
        {shown}
      </Markdown>
    </div>
  );
});
