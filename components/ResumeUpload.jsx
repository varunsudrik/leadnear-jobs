"use client";

// C Resume Upload (spec lines 509-548). Rendered only when the caller has no
// scan yet (app/resume/page.jsx). Owns the whole upload → scanning → error
// cycle for a first scan; components/ResumeScan.jsx runs the same POST for a
// replacement scan, inside its own confirm modal.
//
// No "Import from Files or Drive" — that CTA has nothing behind it (spec
// section 9). The single "Browse files" button plus native drag-and-drop is
// everything this app can actually do.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ScanPips from "@/components/ScanPips";
import ResumeScanning from "@/components/ResumeScanning";
import ResumeError from "@/components/ResumeError";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function formatSize(bytes) {
  if (typeof bytes !== "number") return "";
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export default function ResumeUpload({ quota }) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | scanning | error
  const [pendingFile, setPendingFile] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  async function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    setPendingFile(file);
    setStage("scanning");

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${BASE_PATH}/api/resume/scan`, { method: "POST", body });
      const json = await res.json().catch(() => ({ ok: false, reason: "scanner", detail: "" }));
      if (json.ok) {
        // A successful scan means app/resume/page.jsx now has a row to read.
        // Refreshing re-runs that server component, which swaps this whole
        // component out for <ResumeScan>, so there is no "idle" to return to.
        router.refresh();
        return;
      }
      setErrorInfo({ reason: json.reason, detail: json.detail });
      setStage("error");
    } catch {
      setErrorInfo({ reason: "scanner", detail: "" });
      setStage("error");
    }
  }

  function resetToIdle() {
    setStage("idle");
    setPendingFile(null);
    setErrorInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (stage === "scanning") {
    return (
      <div className="console-shell">
        <h1 className="rs-title" style={{ marginBottom: 16 }}>Resume scan</h1>
        <ResumeScanning filename={pendingFile?.name} sizeLabel={formatSize(pendingFile?.size)} />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="console-shell">
        <div className="rs-head" style={{ marginBottom: 16 }}>
          <h1 className="rs-title">Resume scan</h1>
          <span className="ru-pips"><ScanPips used={quota.used} quota={quota.quota} /></span>
        </div>
        <div className="re-list">
          <ResumeError
            reason={errorInfo.reason}
            detail={errorInfo.detail}
            filename={pendingFile?.name}
            quota={quota}
            onRetry={resetToIdle}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="console-shell">
      <div className="rs-head" style={{ marginBottom: 16 }}>
        <h1 className="rs-title">Resume scan</h1>
        <span className="ru-pips"><ScanPips used={quota.used} quota={quota.quota} /></span>
      </div>

      <div className="ru-grid">
        <div className="ru-panel">
          <div
            className={dragOver ? "ru-drop is-dragover" : "ru-drop"}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            {dragOver ? (
              <div className="ru-release">Release to upload</div>
            ) : (
              <>
                <span className="ru-drop-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5b4ef0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                </span>
                <div className="ru-drop-title">Drop your resume here</div>
                <div className="ru-drop-sub">or pick a file from your computer</div>
                <button type="button" className="ru-browse" onClick={() => fileInputRef.current?.click()}>
                  Browse files
                </button>
                <div className="ru-hint mono">PDF · max 2 MB · max 10 pages</div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div className="ru-props">
            <div className="ru-prop">
              <div className="ru-prop-n mono">01</div>
              <div className="ru-prop-title">An ATS score out of 100</div>
              <div className="ru-prop-desc">Parse, keywords, format and impact, each scored separately.</div>
            </div>
            <div className="ru-prop">
              <div className="ru-prop-n mono">02</div>
              <div className="ru-prop-title">The text a parser actually reads</div>
              <div className="ru-prop-desc">Your file as plain text, with the lines that break parsing flagged.</div>
            </div>
            <div className="ru-prop">
              <div className="ru-prop-n mono">03</div>
              <div className="ru-prop-title">Every open role ranked by fit</div>
              <div className="ru-prop-desc">Strong, Good or Low against every live posting.</div>
            </div>
          </div>
        </div>

        <div className="ru-side">
          <div className="ru-good">
            <div className="ru-good-head">Good to know</div>
            <div className="ru-good-list">
              <div className="ru-good-item"><span className="ru-good-check">✓</span><span>We store the text we show you, never the file.</span></div>
              <div className="ru-good-item"><span className="ru-good-check">✓</span><span>Scoring against a different job title later is free.</span></div>
              <div className="ru-good-item"><span className="ru-good-check">✓</span><span>Delete your scan any time from your account.</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
