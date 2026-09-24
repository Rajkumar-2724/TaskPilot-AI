import { useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";

const SAMPLE_HEADERS = ["name", "project_code", "sector", "ministry", "state", "original_cost", "revised_cost", "expenditure", "planned_duration_months", "actual_duration_months", "physical_progress", "financial_progress", "planned_progress", "total_milestones", "completed_milestones", "delayed_milestones", "resource_availability", "planned_start_date", "planned_end_date", "project_status", "reporting_period"];

const ProjectImport = () => {
  const { user } = useAuth();
  const canImport = user?.role === "Manager" || user?.role === "Admin";
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState("");
  const [mode, setMode] = useState("csv"); // csv | json
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = (e) => setFile(e.target.files[0] || null);

  const doImport = async () => {
    if (!canImport) {
      toast.error("Only Managers and Admins can import projects");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      let data;
      if (mode === "csv") {
        if (!file) {
          toast.error("Please choose a CSV file");
          setUploading(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post("/projects/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
        data = res.data;
      } else {
        if (!jsonText.trim()) {
          toast.error("Please paste a JSON array of project records");
          setUploading(false);
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(jsonText.trim());
        } catch {
          toast.error("Invalid JSON. Provide an array of objects or { projects: [...] }");
          setUploading(false);
          return;
        }
        const res = await api.post("/projects/import", Array.isArray(parsed) ? parsed : parsed.projects ? { projects: parsed.projects } : parsed, {
          headers: { "Content-Type": "application/json" },
        });
        data = res.data;
      }
      setResult(data);
      toast.success(`Imported ${data?.imported ?? 0} project(s)`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const copySample = () => {
    setJsonText(JSON.stringify([
      {
        name: "Sample Highway Upgrade", projectCode: "SAMPLE-001", sector: "Transport", ministry: "Ministry of Road Transport & Highways", state: "Maharashtra",
        originalCost: 1500000000, revisedCost: 1750000000, expenditure: 900000000,
        plannedDuration: 36, actualDuration: 40, physicalProgress: 60, financialProgress: 55, plannedProgress: 58,
        totalMilestones: 8, completedMilestones: 5, delayedMilestones: 1, resourceAvailability: 80,
        plannedStartDate: "2023-01-01", plannedEndDate: "2025-12-31", projectStatus: "Active", reportingPeriod: "2026-08",
      },
    ], null, 2));
    setMode("json");
  };

  const fmtRupee = (n) => `₹${(Number(n) / 100000).toFixed(2)} Cr`;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <h4 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Data Import & Validation</span>
      </h4>
      <p className="mb-4" style={{ color: "#94A3B8" }}>
        Bulk-upload infrastructure projects from a CSV file (or JSON). Rows that fail validation are rejected with an explicit reason;
        warnings are surfaced but do not block the import.
      </p>

      {!canImport && (
        <div className="tp-box-subtle p-3 mb-3" style={{ border: "1px solid rgba(245,158,11,0.3)" }}>
          <i className="bi bi-shield-lock me-2" style={{ color: "#F59E0B" }} /> Only <strong>Managers</strong> and <strong>Admins</strong> can import project data.
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="tp-card p-4">
            <div className="d-flex gap-2 mb-3">
              <button className={`btn btn-sm ${mode === "csv" ? "tp-btn-primary" : "btn-light"}`} style={{ borderRadius: 10 }} onClick={() => setMode("csv")}>
                <i className="bi bi-file-earmark-spreadsheet me-1" /> CSV File
              </button>
              <button className={`btn btn-sm ${mode === "json" ? "tp-btn-primary" : "btn-light"}`} style={{ borderRadius: 10 }} onClick={() => setMode("json")}>
                <i className="bi bi-braces me-1" /> JSON
              </button>
            </div>

            {mode === "csv" ? (
              <>
                <div
                  className="text-center p-4 rounded mb-3"
                  style={{ border: "2px dashed rgba(56,189,248,0.4)", cursor: "pointer" }}
                  onClick={() => fileRef.current?.click()}
                >
                  <i className="bi bi-cloud-arrow-up fs-3" style={{ color: "#38BDF8" }} />
                  <div className="small mt-2" style={{ color: "#94A3B8" }}>
                    {file ? <strong style={{ color: "#38BDF8" }}>{file.name}</strong> : "Click to choose a CSV file (UTF-8)"}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="d-none" onChange={onFile} />
              </>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-label small mb-0" style={{ color: "#94A3B8" }}>JSON payload (array of records or {"{ projects: [...] }"})</label>
                  <button className="btn btn-sm btn-light" style={{ borderRadius: 8 }} onClick={copySample}><i className="bi bi-clipboard me-1" /> Insert sample</button>
                </div>
                <textarea className="form-control mb-3" rows={12} style={{ fontFamily: "monospace", fontSize: "0.78rem" }} value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)} placeholder='[{"name": "...", "projectCode": "...", ...}]' />
              </>
            )}

            <button className="tp-btn-primary w-100" onClick={doImport} disabled={uploading}>
              {uploading ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Importing...</> : <><i className="bi bi-upload me-1" /> Import Projects</>}
            </button>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-2" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Accepted CSV columns</h6>
            <p className="small" style={{ color: "#94A3B8" }}>Headers are matched case-insensitively (aliases supported, e.g. <code>project_code</code>, <code>codigo</code>…). Amounts are plain rupee values.</p>
            <div className="d-flex flex-wrap gap-1 mb-3">
              {SAMPLE_HEADERS.map((h) => (
                <span key={h} className="badge" style={{ background: "rgba(56,189,248,0.1)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.2)", fontSize: "0.7rem", fontFamily: "monospace" }}>{h}</span>
              ))}
            </div>
            <div className="small" style={{ color: "#94A3B8" }}>
              Validation: required <code>name</code>; <code>physical/financial/planned_progress</code> must be 0–100; negatives rejected; duplicate
              project codes and pre-existing codes are rejected. Date inconsistencies and expenditure over revised cost produce warnings only.
            </div>
          </div>

          {result && (
            <div className="mt-3 tp-card p-4">
              <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-clipboard-check me-2" style={{ color: "#22C55E" }} />Import result
              </h6>
              <div className="row g-2 mb-3 text-center">
                <div className="col-4"><div className="fw-bold fs-5" style={{ color: "#22C55E" }}>{result.imported}</div><div className="small text-muted">Imported</div></div>
                <div className="col-4"><div className="fw-bold fs-5" style={{ color: "#EF4444" }}>{result.rejected}</div><div className="small text-muted">Rejected</div></div>
                <div className="col-4"><div className="fw-bold fs-5" style={{ color: "#38BDF8" }}>{result.total}</div><div className="small text-muted">Total records</div></div>
              </div>

              {result.sample?.length > 0 && (
                <div className="mb-2 small" style={{ color: "#94A3B8" }}>
                  First imported: <strong style={{ color: "var(--tp-text)" }}>{result.sample[0].name}</strong> ({result.sample[0].projectCode})
                </div>
              )}

              {result.warnings?.length > 0 && (
                <div className="mb-2">
                  <div className="small fw-bold mb-1" style={{ color: "#F59E0B" }}><i className="bi bi-exclamation-triangle me-1" />Warnings ({result.warnings.length})</div>
                  <div style={{ maxHeight: 120, overflowY: "auto" }}>
                    {result.warnings.map((w, i) => <div key={i} className="small text-muted" style={{ fontSize: "0.75rem" }}>• {w}</div>)}
                  </div>
                </div>
              )}

              {result.failures?.length > 0 && (
                <div>
                  <div className="small fw-bold mb-1" style={{ color: "#EF4444" }}><i className="bi bi-x-circle me-1" />Rejected rows</div>
                  <div style={{ maxHeight: 140, overflowY: "auto" }}>
                    {result.failures.map((f, i) => (
                      <div key={i} className="small mb-1" style={{ fontSize: "0.75rem", color: "#ef6b6b" }}>
                        <strong>Row {f.index} {f.projectCode ? `(${f.projectCode})` : ""}:</strong> {f.errors.join("; ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectImport;