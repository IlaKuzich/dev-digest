import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: "1.7em",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 20px",
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: "1.2em",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "28px 0 10px",
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: "1.05em",
                fontWeight: 650,
                color: "var(--text-primary)",
                margin: "20px 0 8px",
              }}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4
              style={{
                fontSize: "1em",
                fontWeight: 650,
                color: "var(--text-primary)",
                margin: "16px 0 6px",
              }}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          ul: ({ children }) => (
            <ul
              style={{
                margin: "0 0 12px",
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                margin: "0 0 12px",
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => <li style={{ lineHeight: 1.55 }}>{children}</li>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
