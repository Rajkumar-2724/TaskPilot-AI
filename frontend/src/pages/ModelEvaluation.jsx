import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ScatterChart, Scatter, Line, ZAxis,
} from "recharts";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";

const MODEL_TYPES = [
  { value: "cost", label: "Cost Overrun" },
  { value: "time", label: "Time Overrun" },
];

const EMPTY_STATE = {
  splitInfo: null,
  cv: null,
  featureImportance: null,
  actualVsPredicted: null,
};

const ModelEvaluation = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [data, setData] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mlAvailable, setMlAvailable] = useState(true);
  const [retraining, setRetraining] = useState(false);

  const [modelType, setModelType] = useState("cost");
  const [evalLoading, setEvalLoading] = useState({ split: false, cv: false, fi: false, avp: false });
  const [evalData, setEvalData] = useState(EMPTY_STATE);
  const [evalError, setEvalError] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/models/metrics").then(({ data }) => setData(data)).catch(() => { setMlAvailable(false); }),
      api.get("/models").then(({ data }) => {
        setRegistry(data.models || []);
        if (data.models?.length > 0) setMlAvailable(true);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const retrain = async () => {
    setRetraining(true);
    try {
      await api.post("/models/train");
      toast.success("Models retrained successfully");
      load();
    } catch (err) {
      if (err.response?.status === 503) {
        setMlAvailable(false);
        toast.error("The ML service is unreachable from the backend. Set ML_SERVICE_URL on the backend host to the ML service URL.");
      } else {
        toast.error(err.response?.data?.message || "Retraining failed");
      }
    } finally {
      setRetraining(false);
    }
  };

  const loadEval = async (type) => {
    setEvalLoading((prev) => ({ ...prev, [type]: true }));
    setEvalError((prev) => ({ ...prev, [type]: null }));
    try {
      const endpoints = { split: `/models/evaluation/${modelType}/split-info`, cv: `/models/evaluation/${modelType}/cross-validation`, fi: `/models/evaluation/${modelType}/feature-importance`, avp: `/models/evaluation/${modelType}/actual-vs-predicted` };
      const res = await api.get(endpoints[type]);
      const keyMap = { split: "splitInfo", cv: "cv", fi: "featureImportance", avp: "actualVsPredicted" };
      setEvalData((prev) => ({ ...prev, [keyMap[type]]: res?.data }));
    } catch (err) {
      setEvalError((prev) => ({ ...prev, [type]: err.response?.data?.message || "Failed to load" }));
    } finally {
      setEvalLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const loadAllEval = async () => {
    setEvalLoading({ split: true, cv: true, fi: true, avp: true });
    setEvalError({});
    try {
      const [splitRes, cvRes, fiRes, avpRes] = await Promise.all([
        api.get(`/models/evaluation/${modelType}/split-info`),
        api.get(`/models/evaluation/${modelType}/cross-validation`),
        api.get(`/models/evaluation/${modelType}/feature-importance`),
        api.get(`/models/evaluation/${modelType}/actual-vs-predicted`),
      ]);
      setEvalData({
        splitInfo: splitRes?.data,
        cv: cvRes?.data,
        featureImportance: fiRes?.data,
        actualVsPredicted: avpRes?.data,
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load evaluation data");
    } finally {
      setEvalLoading({ split: false, cv: false, fi: false, avp: false });
    }
  };

  useEffect(() => { loadAllEval(); }, [modelType]);

  if (loading) return <div className="tp-skeleton" style={{ height: 320, borderRadius: 16 }} />;

  const metrics = data?.metrics || data || [];
  const baseline = data?.baseline || [];
  const ml = data?.ml || [];
  const hasMetrics = metrics.length > 0;

  const chartData = ml.length > 0
    ? ml.filter((m) => m.metricName === "MAE").map((m) => ({ name: m.modelName, baseline: m.baselineValue, model: m.metricValue }))
    : metrics.filter((m) => m.metricName === "MAE" && m.baselineValue != null).map((m) => ({ name: m.modelName, baseline: m.baselineValue, model: m.metricValue }));

  const splitInfo = evalData.splitInfo;
  const cvData = evalData.cv;
  const fiData = evalData.featureImportance;
  const avpData = evalData.actualVsPredicted;

  const isDemoDataset = splitInfo?.datasetLabel?.includes("Demo") || splitInfo?.datasetLabel?.includes("Synthetic") || splitInfo?.totalRecords === 240;

  const fiChartData = fiData?.featureImportance
    ? Object.entries(fiData.featureImportance).map(([name, value]) => ({ name, importance: value }))
    : [];

  const avpChartData = avpData?.predictions || [];
  const cvFoldData = cvData?.folds || [];
  const cvMean = cvData?.meanMetrics || null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
        <h4 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Model Evaluation</span>
        </h4>
        {isAdmin && (
          <button className="tp-btn-primary" onClick={retrain} disabled={retraining}>
            {retraining ? <><span className="spinner-border spinner-border-sm me-2" />Retraining...</> : <><i className="bi bi-arrow-repeat me-1" /> Retrain Models</>}
          </button>
        )}
      </div>
      <p className="mb-4" style={{ color: "#94A3B8" }}>
        Stored evaluation metrics for the cost & schedule prediction models, compared against a non-ML baseline (mean predictor).
        All models are trained locally with scikit-learn.
      </p>

      {!mlAvailable && (
        <div className="tp-box-subtle p-3 mb-4" style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
          <strong className="text-danger"><i className="bi bi-exclamation-triangle me-1" /> ML service not reachable.</strong>
          <span className="ms-2 small text-muted">Requires the ML service to be reachable from the backend (ML_SERVICE_URL).</span>
        </div>
      )}

      {isDemoDataset && (
        <div className="tp-box-subtle p-3 mb-3" style={{ border: "1px solid rgba(245,158,11,0.3)" }}>
          <strong style={{ color: "#F59E0B" }}><i className="bi bi-tag me-1" /> Demo/Synthetic Dataset</strong>
          <span className="ms-2 small text-muted">Currently using generated demo data. When real infrastructure data is connected, all metrics will update automatically.</span>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-lg-3">
          <label className="form-label small" style={{ color: "#94A3B8" }}>Select Model Target</label>
          <select className="form-select" value={modelType} onChange={(e) => setModelType(e.target.value)} style={{ background: "var(--tp-surface)", borderColor: "var(--tp-glass-border)", color: "var(--tp-text)" }}>
            {MODEL_TYPES.map((mt) => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
          </select>
        </div>
        <div className="col-lg-3 d-flex align-items-end">
          <button className="tp-btn-primary w-100" onClick={loadAllEval} disabled={evalLoading.split || evalLoading.cv || evalLoading.fi || evalLoading.avp}>
            {(evalLoading.split || evalLoading.cv || evalLoading.fi || evalLoading.avp) ? <><span className="spinner-border spinner-border-sm me-2" />Loading…</> : <><i className="bi bi-arrow-clockwise me-1" /> Refresh Evaluation</>}
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Evaluation metrics (ML vs baseline)</h6>
            {!hasMetrics ? (
              <p className="small" style={{ color: "#94A3B8" }}>No stored model metrics yet. An Admin can retrain the models to generate them.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead><tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}><th>Model</th><th>Metric</th><th>Value</th><th>Baseline</th><th>vs baseline</th><th>Dataset</th></tr></thead>
                  <tbody>
                    {metrics.map((m, i) => {
                      const base = m.baselineValue;
                      const pct = base != null && Number(base) > 0 ? ((Number(m.metricValue) / Number(base)) * 100).toFixed(0) : null;
                      return (
                        <tr key={i}>
                          <td className="small" style={{ color: "var(--tp-text)" }}>{m.modelName}</td>
                          <td><span className="badge tp-badge-low">{m.metricName}</span></td>
                          <td style={{ color: "var(--tp-text)", fontWeight: 600 }}>{m.metricValue}</td>
                          <td>{base ?? "—"}</td>
                          <td>{pct ? <span style={{ color: m.metricName === "R2" ? "#22C55E" : "#38BDF8" }}>{m.metricName === "R2" ? "n/a" : `${pct}% of baseline`}</span> : "—"}</td>
                          <td className="small text-muted">{m.datasetLabel || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {data?.datasetLabel && <div className="small mt-2" style={{ color: "#F59E0B" }}><i className="bi bi-tag me-1" /> {data.datasetLabel}</div>}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="tp-card p-4 mb-3">
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>MAE: model against baseline</h6>
            {chartData.length === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No MAE comparison available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                  <Legend />
                  <Bar dataKey="baseline" fill="#64748B" name="Baseline (mean)" />
                  <Bar dataKey="model" fill="#38BDF8" name="ML model" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Model registry</h6>
            {registry.length === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No model registry available (ML service offline or never trained).</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead><tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}><th>Model</th><th>Algorithm</th><th>Status</th></tr></thead>
                  <tbody>
                    {registry.map((m) => (
                      <tr key={m.modelId || m.file}>
                        <td className="small" style={{ color: "var(--tp-text)" }}>{m.modelName}</td>
                        <td className="small text-muted">{m.algorithm}</td>
                        <td><span className="badge" style={{ background: m.status === "trained" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: m.status === "trained" ? "#22C55E" : "#EF4444" }}>{m.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row g-3 mt-2">
        <div className="col-12">
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-graph-down me-1" /> Advanced Evaluation — {modelType === "cost" ? "Cost Overrun" : "Time Overrun"} Model
            </h6>
            <div className="row g-3">
              <div className="col-lg-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small fw-bold" style={{ color: "var(--tp-text)" }}>Train/Test Split</span>
                  <button className="btn btn-sm btn-light" style={{ fontSize: "0.7rem", padding: "2px 8px" }} onClick={() => loadEval("split")} disabled={evalLoading.split}>
                    {evalLoading.split ? "…" : <i className="bi bi-refresh" />}
                  </button>
                </div>
                {evalLoading.split && <div className="tp-skeleton" style={{ height: 60, borderRadius: 8 }} />}
                {evalError.split && <div className="small text-danger">{evalError.split}</div>}
                {splitInfo && !evalLoading.split && !evalError.split && (
                  <div className="d-flex flex-column gap-1 small">
                    <div><span style={{ color: "#94A3B8" }}>Dataset:</span> <strong>{splitInfo.datasetLabel}</strong> {isDemoDataset && <span style={{ color: "#F59E0B" }}>(Demo)</span>}</div>
                    <div><span style={{ color: "#94A3B8" }}>Total Records:</span> <strong>{splitInfo.totalRecords}</strong></div>
                    <div><span style={{ color: "#94A3B8" }}>Features:</span> <strong>{splitInfo.numFeatures}</strong></div>
                    <div><span style={{ color: "#94A3B8" }}>Training:</span> <strong>{splitInfo.trainRecords}</strong></div>
                    <div><span style={{ color: "#94A3B8" }}>Test:</span> <strong>{splitInfo.testRecords}</strong></div>
                    <div><span style={{ color: "#94A3B8" }}>Split:</span> <strong>{splitInfo.trainTestSplit?.train * 100}% / {splitInfo.trainTestSplit?.test * 100}%</strong></div>
                    <div><span style={{ color: "#94A3B8" }}>Method:</span> <strong>{splitInfo.splitMethod?.split("(")[0]?.trim()}</strong></div>
                    <div className="small text-muted mt-1" style={{ color: "#94A3B8" }}>Features: {splitInfo.featureNames?.slice(0, 5)?.join(", ")}{splitInfo.featureNames?.length > 5 ? ` + ${splitInfo.featureNames.length - 5} more` : ""}</div>
                  </div>
                )}
                {!splitInfo && !evalLoading.split && !evalError.split && (
                  <div className="small" style={{ color: "#94A3B8" }}>Click refresh or wait to load split info.</div>
                )}
              </div>

              <div className="col-lg-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small fw-bold" style={{ color: "var(--tp-text)" }}>5-Fold Cross-Validation</span>
                  <button className="btn btn-sm btn-light" style={{ fontSize: "0.7rem", padding: "2px 8px" }} onClick={() => loadEval("cv")} disabled={evalLoading.cv}>
                    {evalLoading.cv ? "…" : <i className="bi bi-refresh" />}
                  </button>
                </div>
                {evalLoading.cv && <div className="tp-skeleton" style={{ height: 80, borderRadius: 8 }} />}
                {evalError.cv && <div className="small text-danger">{evalError.cv}</div>}
                {cvData && !evalLoading.cv && !evalError.cv && (
                  <div>
                    <div className="small mb-1" style={{ color: "#94A3B8" }}>{cvData.numFolds}-fold · {cvData.chronological ? "Chronological" : "Shuffle"} (seed={cvData.randomState})</div>
                    <div className="table-responsive">
                      <table className="table table-sm" style={{ fontSize: "0.72rem" }}>
                        <thead><tr style={{ color: "#94A3B8" }}><th>Fold</th><th>MAE</th><th>RMSE</th><th>R²</th></tr></thead>
                        <tbody>
                          {cvFoldData.map((f, i) => (
                            <tr key={i}><td>{f.fold}</td><td>{f.mae?.toFixed(4)}</td><td>{f.rmse?.toFixed(4)}</td><td>{f.r2?.toFixed(4)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {cvMean && (
                      <div className="mt-1 d-flex gap-3 small">
                        <span><strong>Mean MAE:</strong> {cvMean.mae?.toFixed(4)} ± {cvMean.maeStd?.toFixed(4)}</span>
                        <span><strong>Mean R²:</strong> {cvMean.r2?.toFixed(4)} ± {cvMean.r2Std?.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                )}
                {!cvData && !evalLoading.cv && !evalError.cv && (
                  <div className="small" style={{ color: "#94A3B8" }}>Click refresh to load CV results.</div>
                )}
              </div>

              <div className="col-lg-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small fw-bold" style={{ color: "var(--tp-text)" }}>Feature Importance</span>
                  <button className="btn btn-sm btn-light" style={{ fontSize: "0.7rem", padding: "2px 8px" }} onClick={() => loadEval("fi")} disabled={evalLoading.fi}>
                    {evalLoading.fi ? "…" : <i className="bi bi-refresh" />}
                  </button>
                </div>
                {evalLoading.fi && <div className="tp-skeleton" style={{ height: 80, borderRadius: 8 }} />}
                {evalError.fi && <div className="small text-danger">{evalError.fi}</div>}
                {fiData && !evalLoading.fi && !evalError.fi && (
                  <div>
                    <div className="small mb-1" style={{ color: "#94A3B8" }}>Model: {fiData.modelName} · {fiData.numFeatures} features</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={fiChartData.slice(0, 10).reverse()} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                        <XAxis type="number" stroke="#94A3B8" />
                        <YAxis type="category" dataKey="name" stroke="#94A3B8" width={100} />
                        <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                        <Bar dataKey="importance" fill="#6366F1" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="small text-muted mt-1">Total importance: {fiData.totalImportance?.toFixed(4)}</div>
                  </div>
                )}
                {!fiData && !evalLoading.fi && !evalError.fi && (
                  <div className="small" style={{ color: "#94A3B8" }}>Click refresh to load feature importance.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mt-2">
        <div className="col-12">
          <div className="tp-card p-4">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
              <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-graph-down-arrow me-1" /> Actual vs Predicted — {modelType === "cost" ? "Cost Overrun" : "Time Overrun"}
              </h6>
              <button className="btn btn-sm btn-light" onClick={() => loadEval("avp")} disabled={evalLoading.avp}>
                {evalLoading.avp ? <><span className="spinner-border spinner-border-sm me-1" />…</> : <><i className="bi bi-refresh me-1" /> Refresh</>}
              </button>
            </div>
            {evalLoading.avp && <div className="tp-skeleton" style={{ height: 300, borderRadius: 8 }} />}
            {evalError.avp && <div className="small text-danger mb-3">{evalError.avp}</div>}
            {avpData && !evalLoading.avp && !evalError.avp && (
              <div>
                <div className="row g-3 mb-3">
                  <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Test Samples</div><div className="fw-bold" style={{ color: "var(--tp-text)" }}>{avpData.testSamples}</div></div>
                  <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>MAE</div><div className="fw-bold" style={{ color: "var(--tp-text)" }}>{avpData.mae?.toFixed(4)}</div></div>
                  <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>RMSE</div><div className="fw-bold" style={{ color: "var(--tp-text)" }}>{avpData.rmse?.toFixed(4)}</div></div>
                  <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>R²</div><div className="fw-bold" style={{ color: "var(--tp-text)" }}>{avpData.r2?.toFixed(4)}</div></div>
                </div>
                {(() => {
                  const maxVal = avpData.summary?.actualMax || 1;
                  const diagonalLine = [{ actual: 0, predicted: 0 }, { actual: maxVal, predicted: maxVal }];
                  return avpChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                        <XAxis type="number" dataKey="actual" name="Actual" stroke="#6366F1" label={{ value: "Actual", position: "bottom", offset: 5, style: { fill: "#94A3B8", fontSize: 12 } }} />
                        <YAxis type="number" dataKey="predicted" name="Predicted" stroke="#22C55E" label={{ value: "Predicted", angle: -90, position: "insideLeft", style: { fill: "#94A3B8", fontSize: 12 } }} />
                        <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                        <Line type="monotone" data={diagonalLine} dataKey="predicted" stroke="#EF4444" strokeDasharray="5 5" dot={false} name="Actual = Predicted" />
                        <ZAxis range={[20, 60]} />
                        <Scatter name="Test Predictions" data={avpChartData} fill="#38BDF8" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="small" style={{ color: "#94A3B8" }}>No test predictions available. Train the model to generate predictions.</p>
                  );
                })()}
                {avpData.summary && (
                  <div className="row g-3 mt-2">
                    <div className="col-md-4"><div className="small" style={{ color: "#94A3B8" }}>Residual Mean</div><div className="small" style={{ color: "var(--tp-text)" }}>{avpData.summary?.meanResidual?.toFixed(4)}</div></div>
                    <div className="col-md-4"><div className="small" style={{ color: "#94A3B8" }}>Residual Std</div><div className="small" style={{ color: "var(--tp-text)" }}>{avpData.summary?.stdResidual?.toFixed(4)}</div></div>
                    <div className="col-md-4"><div className="small" style={{ color: "#94A3B8" }}>Actual Range</div><div className="small" style={{ color: "var(--tp-text)" }}>[{avpData.summary?.actualMin?.toFixed(2)}, {avpData.summary?.actualMax?.toFixed(2)}]</div></div>
                  </div>
                )}
                <div className="small mt-2" style={{ color: "#94A3B8" }}>
                  Note: Predictions are generated from the held-out test set ({avpData.trainSamples} training samples, {avpData.testSamples} test samples) using the actual trained model. No synthetic/demo points are shown.
                  {isDemoDataset && <><strong> Demo dataset</strong> — replace with real infrastructure data to see actual predictions.</>}
                </div>
              </div>
            )}
            {!avpData && !evalLoading.avp && !evalError.avp && (
              <div className="small" style={{ color: "#94A3B8" }}>Click refresh to load actual vs predicted plot.</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ModelEvaluation;