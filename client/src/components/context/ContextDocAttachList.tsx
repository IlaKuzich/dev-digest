"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";
import { getDocType, BADGE_COLORS, DOC_TYPE_I18N } from "./context-utils";

const TOKEN_WARNING_THRESHOLD = 8000;

interface Props {
  /** All available context docs (from GET /repos/:id/context). */
  allDocs: SpecFile[];
  /** Currently attached paths (ordered). */
  attachedPaths: string[];
  /** Called when the user checks/unchecks or reorders docs. */
  onUpdate: (newPaths: string[]) => void;
  /** When true, the save operation is in-flight. */
  isPending?: boolean;
  /** Callback for "Preview" button — renders the doc in the parent. */
  onPreview?: (doc: SpecFile) => void;
}

/** Split "client/insights/INSIGHTS.md" into { folder: "client/insights/", name: "INSIGHTS.md" }. */
function splitPath(path: string) {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  const folder = parts.length > 0 ? `${parts.join("/")}/` : "";
  return { folder, name };
}

/**
 * ContextDocAttachList — reusable attach/detach + drag-and-drop list for
 * agent and skill context docs.
 *
 * Attached docs appear first (in user-set order). Unattached docs follow.
 * Toggling a checkbox adds to end / removes from list. Drag handles reorder
 * only the attached section. A filter box narrows the visible set without
 * affecting the attached-token total.
 */
export function ContextDocAttachList({
  allDocs,
  attachedPaths,
  onUpdate,
  isPending,
  onPreview,
}: Props) {
  const t = useTranslations("context");

  const [dragSrc, setDragSrc] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const attachedSet = new Set(attachedPaths);
  const attachedSum = allDocs
    .filter((d) => d.path != null && attachedSet.has(d.path))
    .reduce((sum, d) => sum + (d.estimated_tokens ?? 0), 0);

  const overThreshold = attachedSum > TOKEN_WARNING_THRESHOLD;

  const q = query.trim().toLowerCase();
  const visibleDocs = q
    ? allDocs.filter((d) => (d.path ?? "").toLowerCase().includes(q))
    : allDocs;
  const visibleSet = new Set(visibleDocs.map((d) => d.path));

  // Partition: attached first (in user order), then unattached alphabetically.
  const attachedDocs = attachedPaths
    .map((p) => allDocs.find((d) => d.path === p))
    .filter((d): d is SpecFile => d != null && visibleSet.has(d.path));
  const unattachedDocs = allDocs
    .filter((d) => d.path != null && !attachedSet.has(d.path!) && visibleSet.has(d.path))
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));

  function handleToggle(path: string, checked: boolean) {
    if (checked) {
      onUpdate([...attachedPaths, path]);
    } else {
      onUpdate(attachedPaths.filter((p) => p !== path));
    }
  }

  // ---- Drag-and-drop (attached section only) --------------------------------
  function handleDragStart(path: string) {
    setDragSrc(path);
  }

  function handleDragOver(e: React.DragEvent, path: string) {
    e.preventDefault();
    setDragOver(path);
  }

  function handleDrop(targetPath: string) {
    if (!dragSrc || dragSrc === targetPath) {
      setDragSrc(null);
      setDragOver(null);
      return;
    }
    const next = [...attachedPaths];
    const srcIdx = next.indexOf(dragSrc);
    const tgtIdx = next.indexOf(targetPath);
    if (srcIdx === -1 || tgtIdx === -1) return;
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, dragSrc);
    onUpdate(next);
    setDragSrc(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragSrc(null);
    setDragOver(null);
  }

  function renderRow(doc: SpecFile, draggable: boolean) {
    const path = doc.path!;
    const { folder, name } = splitPath(path);
    const docType = getDocType(path);
    const badgeKey = DOC_TYPE_I18N[docType];
    const isAttached = attachedSet.has(path);
    const isDragOver = dragOver === path;

    return (
      <div
        key={path}
        draggable={draggable}
        onDragStart={draggable ? () => handleDragStart(path) : undefined}
        onDragOver={draggable ? (e) => handleDragOver(e, path) : undefined}
        onDrop={draggable ? () => handleDrop(path) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 8,
          background: "var(--bg-hover)",
          outline: isDragOver ? "2px solid var(--accent)" : "none",
          cursor: draggable ? "grab" : "default",
          opacity: dragSrc === path ? 0.4 : 1,
        }}
      >
        {/* Drag handle */}
        <Icon.Menu
          size={14}
          color="var(--text-muted)"
          style={{ flexShrink: 0 }}
        />

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isAttached}
          disabled={isPending}
          onChange={() => handleToggle(path, !isAttached)}
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            accentColor: "var(--accent)",
            cursor: "pointer",
          }}
        />

        {/* Name + folder */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={path}
        >
          <span
            className="mono"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isAttached ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {name}
          </span>
          {folder && (
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}
            >
              {folder}
            </span>
          )}
        </span>

        {/* Type label */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: BADGE_COLORS[docType],
            flexShrink: 0,
          }}
        >
          {t(`attach.${badgeKey}`)}
        </span>

        {/* Token count */}
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, width: 44, textAlign: "right" }}
        >
          {doc.estimated_tokens ?? 0}t
        </span>

        {/* Preview button */}
        {onPreview && (
          <button
            onClick={() => onPreview(doc)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon.Eye size={12} />
            {t("attach.preview")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header: title + attached count + filter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
          {t("attach.title")}
        </h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 999,
            background: "var(--accent-bg)",
            color: "var(--accent-text)",
            flexShrink: 0,
          }}
        >
          {t("attach.attachedCount", {
            attached: attachedPaths.length,
            total: allDocs.length,
          })}
        </span>

        <div style={{ flex: 1 }} />

        {/* Filter input */}
        <div style={{ position: "relative", flexShrink: 0, width: 220 }}>
          <Icon.Search
            size={14}
            color="var(--text-muted)"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("attach.filterPlaceholder")}
            style={{
              width: "100%",
              fontSize: 13,
              padding: "6px 10px 6px 30px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          />
        </div>
      </div>

      {/* Hint */}
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>
        {t("attach.hintPrefix")}{" "}
        <code
          className="mono"
          style={{
            fontSize: "0.95em",
            padding: "1px 5px",
            borderRadius: 3,
            background: "var(--bg-hover)",
            color: "var(--accent-text)",
          }}
        >
          {t("attach.hintCode")}
        </code>{" "}
        {t("attach.hintSuffix")}
      </p>

      {attachedDocs.length === 0 && unattachedDocs.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {t("attach.noResults")}
        </p>
      ) : (
        <>
          {attachedDocs.map((doc) => renderRow(doc, true))}
          {unattachedDocs.map((doc) => renderRow(doc, false))}
        </>
      )}

      {/* Footer: token sum + explanatory note */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingTop: 8,
          marginTop: 8,
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          color: overThreshold ? "var(--warn)" : "var(--text-muted)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{t("attach.footer", { tokens: attachedSum.toLocaleString() })}</span>
          {overThreshold && (
            <span style={{ fontWeight: 600 }}>{t("attach.tokenWarning")}</span>
          )}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {t("attach.footerNotePrefix")}
          <code
            className="mono"
            style={{
              fontSize: "0.95em",
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--bg-hover)",
              color: "var(--accent-text)",
            }}
          >
            {t("attach.hintCode")}
          </code>
          {t("attach.footerNoteSuffix")}
        </span>
      </div>
    </div>
  );
}
