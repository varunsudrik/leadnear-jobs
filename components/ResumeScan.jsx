"use client";

// C Resume ATS (spec lines 215-300). Renders a real, stored scan result —
// app/resume/page.jsx only mounts this once `latestScan(userId)` finds a row.
//
// Two flows live here beyond the read-only display:
//  - "Upload revised" costs a scan, so the design gates it behind a confirm
//    modal (spec lines 225-243) rather than firing on click. Confirming runs
//    the same POST /api/resume/scan as a first scan, then refreshes the
//    route so the server component re-reads the new row.
//  - "Delete my scan data" (spec D11 — the product's own deletion promise)
//    reuses that same modal chrome, per the brief: two destructive-ish
//    actions should look like the same kind of thing. It redacts rather than
//    deletes the row (lib/resume/store.mjs's redactScans): the quota is
//    COUNT(*) over ResumeScan rows (spec D8), so a real delete would let a
//    user reset their free scans for free by deleting and re-scanning.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ScanPips from "@/components/ScanPips";
import ParsedTextView from "@/components/ParsedTextView";
import ResumeScanning from "@/components/ResumeScanning";
import ResumeError, { UpgradePanel, useModalFocusTrap } from "@/components/ResumeError";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function formatSize(bytes) {
  if (typeof bytes !== "number") return "";
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function pipsDots(used, total) {
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < used ? "pip used" : "pip"} />
      ))}
    </span>
  );
}

export default function ResumeScan({ data, quota }) {
  const { scan, score, parts, issues, found, headline, subline } = data;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const wasPending = useRef(false);
  const pendingKind = useRef(null);
  const fileInputRef = useRef(null);
  const replaceModalRef = useRef(null);
  const deleteModalRef = useRef(null);

  // "Upload revised": idle -> confirm (file picked) -> scanning (posted) ->
  // error | quota (rejected) -> idle again once a success refreshes the route.
  const [replaceStage, setReplaceStage] = useState("idle");
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceError, setReplaceError] = useState(null);

  const [deleteStage, setDeleteStage] = useState("idle"); // idle | confirm | deleting
  const [deleteError, setDeleteError] = useState("");

  const [upgradeOpen, setUpgradeOpen] = useState(false); // opened from the "Unlock unlimited" pip

  // router.refresh() re-renders app/resume/page.jsx with fresh data but does
  // NOT unmount this component (unlike ResumeUpload, whose success swaps it
  // out entirely) — the props just change. So the modal this component owns
  // has to close itself once that refresh has actually landed.
  useEffect(() => {
    if (wasPending.current && !isPending) {
      if (pendingKind.current === "replace") {
        setReplaceStage("idle");
        setReplaceFile(null);
        setReplaceError(null);
      } else if (pendingKind.current === "delete") {
        setDeleteStage("idle");
        setDeleteError("");
      }
      pendingKind.current = null;
    }
    wasPending.current = isPending;
  }, [isPending]);

  function refreshAfter(kind) {
    pendingKind.current = kind;
    startTransition(() => router.refresh());
  }

  function onPickReplaceFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setReplaceFile(file);
    setReplaceError(null);
    setReplaceStage("confirm");
  }

  function closeReplace() {
    if (replaceStage === "scanning") return; // no cancelling an in-flight scan
    setReplaceStage("idle");
    setReplaceFile(null);
    setReplaceError(null);
  }

  async function confirmReplace() {
    if (!replaceFile) return;
    setReplaceStage("scanning");
    try {
      const body = new FormData();
      body.append("file", replaceFile);
      const res = await fetch(`${BASE_PATH}/api/resume/scan`, { method: "POST", body });
      const json = await res.json().catch(() => ({ ok: false, reason: "scanner", detail: "" }));
      if (json.ok) {
        refreshAfter("replace");
        return;
      }
      setReplaceError({ reason: json.reason, detail: json.detail });
      setReplaceStage(json.reason === "quota" ? "quota" : "error");
    } catch {
      setReplaceError({ reason: "scanner", detail: "" });
      setReplaceStage("error");
    }
  }

  function openDeleteConfirm() {
    setDeleteStage("confirm");
    setDeleteError("");
  }

  function closeDelete() {
    if (deleteStage === "deleting") return;
    setDeleteStage("idle");
    setDeleteError("");
  }

  async function confirmDelete() {
    setDeleteStage("deleting");
    try {
      const res = await fetch(`${BASE_PATH}/api/resume/delete`, { method: "POST" });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        refreshAfter("delete");
        return;
      }
      setDeleteError(json.detail || "Could not delete your scan data. Try again.");
      setDeleteStage("confirm");
    } catch {
      setDeleteError("Could not delete your scan data. Try again.");
      setDeleteStage("confirm");
    }
  }

  function closeUpgrade() {
    setUpgradeOpen(false);
    if (replaceStage === "quota") closeReplace();
  }

  function onBackdropClick(e, close) {
    if (e.target === e.currentTarget) close();
  }

  const dimmed = replaceStage === "quota" || upgradeOpen;
  const replaceModalOpen = replaceStage === "confirm" || replaceStage === "scanning" || replaceStage === "error";
  const deleteModalOpen = deleteStage !== "idle";
  const scansAfterReplace = Math.max(0, quota.remaining - 1);
  const replaceModalLabel =
    replaceStage === "confirm" ? "Confirm resume replacement"
    : replaceStage === "scanning" ? "Uploading revised resume"
    : "Resume replacement failed";

  // Escape now works reliably because a descendant genuinely holds focus
  // (the hook moves it there on open) — the backdrop's own onKeyDown, which
  // only fired if focus already happened to be inside, is gone.
  useModalFocusTrap(replaceModalOpen, replaceModalRef, replaceStage, closeReplace);
  useModalFocusTrap(deleteModalOpen, deleteModalRef, deleteStage, closeDelete);

  return (
    <div className="console-shell">
      {/* Everything but the overlays below lives in this inner wrapper so
          .rs-dimmed's blur/opacity never lands on position:fixed content.
          A CSS `filter` on an ancestor creates a containing block for fixed
          descendants AND visually applies to their painted output — so the
          upgrade card itself came out blurred when `rs-dimmed` sat on
          .console-shell directly, one level up from here (measured: its own
          computed `filter` was "none", the ancestor's blur rendered anyway).
          Keeping the modals and the upgrade overlay as siblings of this div,
          not descendants, is what keeps them sharp. */}
      <div className={dimmed ? "rs-dimmed" : undefined}>
        <div className="rs-head">
          <div className="rs-head-main">
            <h1 className="rs-title">Resume scan</h1>
            <span className="rs-meta">{scan.filename} · {scan.pages} {scan.pages === 1 ? "page" : "pages"}</span>
          </div>
          <div className="rs-actions">
            <ScanPips used={quota.used} quota={quota.quota} />
            {quota.exhausted && (
              <button type="button" className="rs-upgrade" onClick={() => setUpgradeOpen(true)}>
                Unlock unlimited
              </button>
            )}
            <button type="button" className="rs-upload" onClick={() => fileInputRef.current?.click()}>
              Upload revised
            </button>
            <Link href="/matches" className="rs-view-matches">View matches →</Link>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={onPickReplaceFile}
        />

        <div className="rs-body">
          <div className="rs-col">
            <ParsedTextView lines={scan.lines} pages={scan.pages} />
            <div className="rs-card">
              <label className="rs-label" htmlFor="scored-against">Scored against</label>
              <select id="scored-against" className="rs-select" disabled defaultValue="general">
                <option value="general">General ATS scoring</option>
              </select>
              <div className="rs-caption">Comparison against live postings is coming.</div>
            </div>
          </div>

          <div className="rs-col">
            <div className="rs-score">
              <div
                className="rs-donut"
                style={{ background: `conic-gradient(var(--accent) 0 ${score}%, var(--border) ${score}% 100%)` }}
              >
                <div className="rs-donut-inner">
                  <span className="rs-donut-score">{score}</span>
                  <span className="rs-donut-label">ATS SCORE</span>
                </div>
              </div>
              <div className="rs-score-copy">
                <div className="rs-headline">{headline}</div>
                <div className="rs-subline">{subline}</div>
                <div className="rs-parts">
                  {parts.map((p) => (
                    <div key={p.label}>
                      <div className="rs-part-head">
                        <span>{p.label}</span>
                        {p.available === false
                          ? <span className="rs-part-soon">Coming soon</span>
                          : <span className="mono">{p.value}</span>}
                      </div>
                      <div className={`rs-track${p.available === false ? " rs-track-soon" : ""}`}>
                        {p.available === false
                          ? null
                          : <i style={{ width: `${p.value}%`, background: p.color }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rs-fixes">
              <div className="rs-fixes-head"><span>Fixes · {issues.length} open</span><span>Est. impact</span></div>
              {issues.map((i) => (
                <label className="rs-fix" key={i.issue}>
                  <input type="checkbox" />
                  <span className={`rs-sev ${i.sev.toLowerCase()}`}>{i.sev}</span>
                  <span className="rs-fix-text"><b>{i.issue}</b><span> — {i.fix}</span></span>
                  <span className="rs-impact">{i.impact}</span>
                </label>
              ))}
            </div>

            <div className="rs-chip-card">
              <div className="rs-chip-head">Keywords found · {found.length}</div>
              <div className="rs-chips">
                {found.map((k) => <span className="rs-chip found" key={k}>{k}</span>)}
              </div>
            </div>
          </div>
        </div>

        <div className="rs-foot">
          <button type="button" className="rs-delete-link" onClick={openDeleteConfirm}>
            Delete my scan data
          </button>
        </div>
      </div>

      {replaceModalOpen && (
        <div
          className="rs-modal-backdrop"
          onClick={(e) => onBackdropClick(e, closeReplace)}
        >
          <div
            className="rs-modal"
            ref={replaceModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={replaceModalLabel}
          >
            {replaceStage === "confirm" && (
              <>
                <div className="rs-modal-pad">
                  <div className="rs-modal-pips">
                    {pipsDots(quota.used, quota.quota)}
                    {quota.used} of {quota.quota} free scans used
                  </div>
                  <h2 className="rs-modal-title">Replacing your resume uses one scan.</h2>
                  <p className="rs-modal-body">
                    A new upload is scored from scratch, so it costs a scan. You would have{" "}
                    <b className="mono">{scansAfterReplace}</b> left.
                  </p>
                </div>
                <div className="rs-modal-file">
                  <span className="rs-modal-file-badge mono">PDF</span>
                  <div className="rs-modal-file-info">
                    <div className="rs-modal-file-name">{replaceFile?.name}</div>
                    <div className="rs-modal-file-meta mono">{formatSize(replaceFile?.size)} · ready</div>
                  </div>
                </div>
                <div className="rs-modal-actions">
                  <button type="button" className="rs-modal-btn-secondary" onClick={closeReplace}>
                    Keep current scan
                  </button>
                  <button type="button" className="rs-modal-btn-primary" onClick={confirmReplace}>
                    Use 1 scan and rescan
                  </button>
                </div>
              </>
            )}
            {replaceStage === "scanning" && (
              <ResumeScanning bare filename={replaceFile?.name} sizeLabel={formatSize(replaceFile?.size)} />
            )}
            {replaceStage === "error" && (
              <ResumeError
                bare
                reason={replaceError.reason}
                detail={replaceError.detail}
                filename={replaceFile?.name}
                quota={quota}
                onRetry={closeReplace}
              />
            )}
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div
          className="rs-modal-backdrop"
          onClick={(e) => onBackdropClick(e, closeDelete)}
        >
          <div
            className="rs-modal"
            ref={deleteModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete scan data"
          >
            <div className="rs-modal-pad">
              <h2 className="rs-modal-title">Delete your scan data?</h2>
              <p className="rs-modal-body">
                This removes the stored text and result for every scan on your account, not just this
                one. Your used scans still count against your free limit — deleting does not give you
                more free scans.
              </p>
              {deleteError && <p className="rs-modal-error">{deleteError}</p>}
            </div>
            <div className="rs-modal-actions">
              <button type="button" className="rs-modal-btn-secondary" onClick={closeDelete} disabled={deleteStage === "deleting"}>
                Keep my data
              </button>
              <button type="button" className="rs-modal-btn-primary" onClick={confirmDelete} disabled={deleteStage === "deleting"}>
                {deleteStage === "deleting" ? "Deleting…" : "Delete my data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(replaceStage === "quota" || upgradeOpen) && (
        <UpgradePanel quota={quota} onDismiss={closeUpgrade} />
      )}
    </div>
  );
}
