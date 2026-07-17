"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { type DiffCommentApi, type DiffFocus } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { SmartDiffViewer } from "../SmartDiffViewer";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Deep-link focus into a file/line (clicking a finding's file:line). */
  focus?: DiffFocus | null;
}

export function DiffTab({ prId, filesCount, files, canComment, focus }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Local focus state seeded from the incoming `focus` prop (deep-links from
  // FindingsTab etc.) so a SmartDiffViewer badge click can ALSO drive the same
  // DiffViewer focus mechanism without lifting state up to PrDetailView — see
  // docs/superpowers/specs/2026-06-29-findings-deep-link-navigation.md §4.
  const [localFocus, setLocalFocus] = React.useState<DiffFocus | null>(focus ?? null);
  const lastPropNonce = React.useRef(focus?.nonce ?? -1);
  const localNonce = React.useRef(focus?.nonce ?? 0);
  React.useEffect(() => {
    if (focus && focus.nonce !== lastPropNonce.current) {
      lastPropNonce.current = focus.nonce;
      localNonce.current = focus.nonce;
      setLocalFocus(focus);
    }
  }, [focus]);
  const handleFocusLine = React.useCallback((file: string, line: number) => {
    localNonce.current += 1;
    setLocalFocus({ file, line, nonce: localNonce.current });
  }, []);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <SmartDiffViewer
        prId={prId}
        files={files}
        commenting={commenting}
        focus={localFocus}
        onFocusLine={handleFocusLine}
      />
    </section>
  );
}
