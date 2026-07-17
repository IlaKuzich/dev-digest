/* ContextAttachTab — shared "Context" tab for both the Agent editor and the
   Skill editor (client-project-structure: lifted to components/ because it's
   used by 2+ routes). Lets the user pick, order, and save an attached subset
   of the repo's discovered specs/docs/insights documents (AC-7…13, AC-28).

   Neither this component nor any hook it calls ever fetches the document
   LIST over the network on toggle — the token estimate (AC-12/13) is pure
   arithmetic over the `useContextDocs` result already in the query cache. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Icon, IconBtn, Markdown, Modal, Skeleton } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useAgentContext,
  useContextDocContent,
  useContextDocs,
  useSetAgentContext,
  useSetSkillContext,
  useSkillContext,
} from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";
import { PROJECT_CONTEXT_HEADING } from "./constants";
import {
  attachedCount,
  attachedTokenEstimate,
  docDirectory,
  docFilename,
  filterRows,
  mergeDocsWithAttachments,
  reorder,
  toSetContextBody,
} from "./helpers";
import type { ContextAttachOwner, ContextRowState } from "./types";
import { s } from "./styles";

export function ContextAttachTab({ owner }: { owner: ContextAttachOwner }) {
  const t = useTranslations("contextAttach");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const isAgent = owner.kind === "agent";

  const { data: docsResponse, isLoading: docsLoading } = useContextDocs(repoId);

  // Both pairs of hooks are always called (rules of hooks) — only the one
  // matching `owner.kind` is enabled; the other is a disabled no-op query.
  const agentAttachments = useAgentContext(isAgent ? owner.id : undefined);
  const skillAttachments = useSkillContext(!isAgent ? owner.id : undefined);
  const setAgentContext = useSetAgentContext(isAgent ? owner.id : undefined);
  const setSkillContext = useSetSkillContext(!isAgent ? owner.id : undefined);

  const attachmentsQuery = isAgent ? agentAttachments : skillAttachments;
  const setMutation = isAgent ? setAgentContext : setSkillContext;

  const [rows, setRows] = React.useState<ContextRowState[]>([]);
  const [filter, setFilter] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const preview = useContextDocContent(repoId, previewPath);

  React.useEffect(() => {
    if (!docsResponse || !attachmentsQuery.data) return;
    setRows(mergeDocsWithAttachments(docsResponse.docs, attachmentsQuery.data));
  }, [docsResponse, attachmentsQuery.data]);

  const toggle = (path: string, attached: boolean) =>
    setRows((prev) => prev.map((r) => (r.doc.path === path ? { ...r, attached } : r)));

  const onDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    setRows((prev) => reorder(prev, dragIndex, dropIndex));
    setDragIndex(null);
  };

  // Keyboard-reachable reorder (accessibility requirement) — no pointer needed.
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => reorder(prev, index, target));
  };

  const save = () =>
    setMutation.mutate(toSetContextBody(rows), {
      onSuccess: () => toast.success(t("savedToast")),
    });

  if (docsLoading || attachmentsQuery.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const visible = filterRows(rows, filter);
  const totalTokens = attachedTokenEstimate(rows);
  const attached = attachedCount(rows);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("title")}</h2>
        <span style={s.count}>{t("attachedCount", { attached, total: rows.length })}</span>
      </div>
      <p style={s.hint}>{t("orderHint")}</p>
      {/* AC-28: state the trust boundary and name the real prompt heading. */}
      <p style={s.untrustedNotice}>
        <Icon.AlertTriangle size={13} /> {t("untrustedNotice", { heading: PROJECT_CONTEXT_HEADING })}
      </p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("filterPlaceholder")}
        style={s.filter}
      />
      <div style={s.list}>
        {visible.map(({ row, index }) => (
          <div key={row.doc.path} style={s.row}>
            <button
              type="button"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
              aria-label={t("dragHandleLabel", { name: docFilename(row.doc.path) })}
              style={s.dragHandle}
            >
              <Icon.Menu size={14} />
            </button>
            <Checkbox checked={row.attached} onChange={(v) => toggle(row.doc.path, v)} label={docFilename(row.doc.path)} />
            <span style={s.dir}>{docDirectory(row.doc.path) || "/"}</span>
            <Badge>{row.doc.root}</Badge>
            <IconBtn
              icon="Eye"
              label={t("previewLabel", { name: docFilename(row.doc.path) })}
              onClick={() => setPreviewPath(row.doc.path)}
            />
            <div style={s.reorderButtons}>
              <IconBtn
                icon="ArrowUp"
                size={20}
                label={t("moveUpLabel", { name: docFilename(row.doc.path) })}
                onClick={() => move(index, -1)}
              />
              <IconBtn
                icon="ArrowDown"
                size={20}
                label={t("moveDownLabel", { name: docFilename(row.doc.path) })}
                onClick={() => move(index, 1)}
              />
            </div>
          </div>
        ))}
      </div>
      <p style={s.footer}>{t("tokensApprox", { count: totalTokens })}</p>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={setMutation.isPending}>
          {setMutation.isPending ? t("saving") : t("save")}
        </Button>
      </div>

      {previewPath && (
        <Modal title={docFilename(previewPath)} subtitle={previewPath} onClose={() => setPreviewPath(null)}>
          <div style={s.previewBody}>
            {preview.isLoading ? <Skeleton height={200} /> : <Markdown>{preview.data?.text}</Markdown>}
          </div>
        </Modal>
      )}
    </div>
  );
}
