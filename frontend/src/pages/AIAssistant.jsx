import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";

const tabs = [
  { id: "summary", label: "Project Summary", icon: "bi-file-text" },
  { id: "risk", label: "Deadline Risk", icon: "bi-exclamation-diamond" },
  { id: "prioritize", label: "Task Priority", icon: "bi-sort-numeric-down" },
  { id: "meeting", label: "Meeting Notes", icon: "bi-mic" },
  { id: "suggest", label: "Task Suggestions", icon: "bi-lightbulb" },
  { id: "grounded", label: "Project Intelligence", icon: "bi-compass" },
];

const AIAssistant = () => {
  const [tab, setTab] = useState("summary");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const chatMessagesRef = useRef([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [groundedMsg, setGroundedMsg] = useState("");
  const [groundedLoading, setGroundedLoading] = useState(false);
  const [groundedMsgs, setGroundedMsgs] = useState([]);

  useEffect(() => {
    api.get("/projects").then(({ data }) => {
      setProjects(data.projects || []);
      if (data.projects?.length) setProjectId(data.projects[0]._id);
    });
  }, []);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      let res;
      if (tab === "summary") res = await api.post("/ai/project-summary", { projectId });
      else if (tab === "risk") res = await api.post("/ai/deadline-risk", { projectId });
      else if (tab === "prioritize") res = await api.post("/ai/prioritize-task", { title: taskTitle, description: taskDesc });
      else if (tab === "meeting") res = await api.post("/ai/meeting-summary", { notes });
      else if (tab === "suggest") res = await api.post("/ai/task-suggestions", { projectId });
      setResult(res.data.result);
    } catch (err) {
      toast.error(err.response?.data?.message || "AI request failed");
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (p) => {
    switch (p) {
      case "Critical": return "tp-badge-critical";
      case "High": return "tp-badge-high";
      case "Medium": return "tp-badge-medium";
      default: return "tp-badge-low";
    }
  };

  const getRiskBadge = (r) => {
    switch (r) {
      case "High": return "tp-badge-critical";
      case "Medium": return "tp-badge-medium";
      default: return "tp-badge-low";
    }
  };

  const sendGrounded = async () => {
  const text = groundedMsg.trim();
  if (!text || groundedLoading) return;
  setGroundedMsgs((prev) => [...prev, { role: "user", content: text }]);
  setGroundedMsg("");
  setGroundedLoading(true);
  try {
    const { data } = await api.post("/assistant/query", { message: text });
    setGroundedMsgs((prev) => [...prev, { role: "assistant", content: data.answer, sources: data.sources || [], mode: data.mode }]);
  } catch (err) {
    setGroundedMsgs((prev) => [...prev, { role: "assistant", content: err.response?.data?.message || "Assistant request failed.", sources: [], mode: "error" }]);
  } finally {
    setGroundedLoading(false);
  }
};

  const sendChat = async () => {
  if (!chatInput.trim() || chatLoading) return;
  const userMsg = { role: "user", content: chatInput.trim() };
  setChatMessages((prev) => {
    chatMessagesRef.current = [...prev, userMsg];
    return [...prev, userMsg];
  });
  setChatInput("");
  setChatLoading(true);
  try {
    const { data } = await api.post("/ai/chat", {
      message: chatInput.trim(),
      history: chatMessagesRef.current,
    });
    const aiMsg = { role: "assistant", content: data.result?.response || data.result?.raw || "No response from AI." };
    setChatMessages((prev) => [...prev, aiMsg]);
  } catch (err) {
    setChatMessages((prev) => [...prev, { role: "assistant", content: err.response?.data?.message || "AI request failed." }]);
  } finally {
    setChatLoading(false);
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

  return (
    <motion.div className="pb-5" variants={containerVariants} initial="hidden" animate="visible">
      <motion.h3 className="fw-bold mb-1" variants={itemVariants} style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">AI Assistant</span>
      </motion.h3>
      <motion.p className="mb-4" variants={itemVariants} style={{ color: '#94A3B8' }}>
        Powered by Google Gemini AI & TaskPilot Smart Intelligence.
      </motion.p>

      <motion.div className="d-flex gap-2 flex-wrap mb-4" variants={itemVariants}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? "tp-btn-primary" : "btn-light"}`}
            style={{ borderRadius: 12 }}
            onClick={() => { setTab(t.id); setResult(null); }}
          >
            <i className={`bi ${t.icon} me-1.5`} /> {t.label}
          </button>
        ))}
      </motion.div>

      <motion.div className="tp-glass p-4 mb-4" variants={itemVariants}>
        {(tab === "summary" || tab === "risk" || tab === "suggest") && (
          <div className="mb-3">
            <label className="form-label">Select Target Project</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {tab === "prioritize" && (
          <>
            <div className="mb-3">
              <label className="form-label">Task Title</label>
              <input className="form-control" placeholder="e.g. Perform database security audit and migration" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">Task Description</label>
              <textarea className="form-control" rows={3} placeholder="Describe scope, dependencies, and target goals..." value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
            </div>
          </>
        )}

        {tab === "meeting" && (
          <div className="mb-3">
            <label className="form-label">Raw Meeting Notes</label>
            <textarea className="form-control" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste raw notes here..." />
          </div>
        )}

        <button className="tp-btn-primary mt-2" onClick={run} disabled={loading} style={{ borderRadius: 12 }}>
          {loading ? (
            <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Analyzing Data...</>
          ) : (
            <><i className="bi bi-stars me-1.5" />Run AI Analysis</>
          )}
        </button>
      </motion.div>

{tab === "grounded" && (
        <motion.div className="tp-glass p-4 mb-4" variants={itemVariants}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="fw-bold mb-0" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-compass me-2" style={{ color: '#38BDF8' }}></i>Project Intelligence (grounded Q&A)
            </h5>
            <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}><i className="bi bi-check-circle me-1" />Answers from your data</span>
          </div>
          <p className="small mb-3" style={{ color: '#94A3B8' }}>
            Every answer is computed against your stored projects (risk, cost, schedule, milestones, drivers, alerts). Try: “Which projects have high cost risk?”, “Why is &lt;project&gt; risky?”, “What changed last month?”, “Compare X with similar projects”.
          </p>
          <div style={{ height: 320, overflowY: "auto", marginBottom: 12, background: 'var(--tp-surface-alt)', borderRadius: 12, padding: 12 }}>
            {groundedMsgs.length === 0 && (
              <div className="text-center py-4" style={{ color: '#94A3B8' }}>
                <i className="bi bi-chat-dots fs-3 d-block mb-2" />
                <p className="mb-0 small">Ask a data-backed question about your infrastructure projects.</p>
              </div>
            )}
            {groundedMsgs.map((msg, i) => (
              <div key={i} className={`mb-3 ${msg.role === "user" ? "text-end" : ""}`}>
                <span className="badge" style={{ background: msg.role === "user" ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(56, 189, 248, 0.2))' : 'rgba(34,197,94,0.12)', color: msg.role === "user" ? 'var(--tp-text)' : '#22C55E' }}>
                  {msg.role === "user" ? "You" : "Intelligence"}
                </span>
                <div className={`mt-1 p-3 rounded`} style={{
                  display: "inline-block", maxWidth: "92%", textAlign: "left",
                  background: msg.role === "user" ? 'rgba(99, 102, 241, 0.15)' : 'rgba(34,197,94,0.05)',
                  border: msg.role === "user" ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(34,197,94,0.15)',
                  color: 'var(--tp-text)', fontSize: '0.9rem',
                }}>
                  {msg.content}
                  {msg.mode && <div className="small mt-1" style={{ color: '#94A3B8' }}><i className="bi bi-lightning-charge me-1" />{msg.mode}</div>}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2">
                      <div className="small text-uppercase mb-1" style={{ color: '#64748B', fontSize: '0.68rem' }}>Sources</div>
                      {msg.sources.map((s, j) => (
                        <div key={j} className="small mb-1" style={{ color: '#94A3B8' }}>
                          <i className="bi bi-database me-1" style={{ color: '#38BDF8' }} />
                          <strong style={{ color: 'var(--tp-text)' }}>{s.projectName || "(project)"}</strong>
                          {s.projectCode ? ` · ${s.projectCode}` : ""} <span className="text-muted">{s.detail ? `— ${s.detail}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {groundedLoading && <div style={{ color: '#94A3B8' }}><i className="bi bi-hourglass-split" /> Analysing your project data...</div>}
          </div>
          <div className="input-group">
            <input type="text" className="form-control" placeholder="e.g. Which projects are at high schedule risk?"
              value={groundedMsg} onChange={(e) => setGroundedMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendGrounded()} disabled={groundedLoading} />
            <button className="tp-btn-primary" onClick={sendGrounded} disabled={groundedLoading || !groundedMsg.trim()} style={{ borderRadius: '0 12px 12px 0' }}>
              <i className="bi bi-send" />
            </button>
          </div>
        </motion.div>
      )}

      {result && (
        <motion.div className="tp-glass p-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h5 className="fw-bold mb-0" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-cpu me-2" style={{ color: '#38BDF8' }}></i>Analysis Results
            </h5>
            {result.analysisMode && (
              <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <i className="bi bi-lightning-charge me-1"></i>{result.analysisMode}
              </span>
            )}
          </div>

          {tab === "summary" && typeof result === "object" && result.summary && (
            <div className="row g-3">
              <div className="col-12">
                <div className="tp-box-subtle">
                  <strong style={{ color: '#38BDF8' }} className="d-block mb-1"><i className="bi bi-file-earmark-text me-1"></i>Executive Summary</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.summary}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="tp-box-subtle">
                  <strong style={{ color: '#F59E0B' }} className="d-block mb-1"><i className="bi bi-speedometer2 me-1"></i>Progress Status</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.progress}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="tp-box-subtle">
                  <strong style={{ color: '#22C55E' }} className="d-block mb-1"><i className="bi bi-check2-square me-1"></i>Completed Work</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.completedWork}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="tp-box-subtle">
                  <strong style={{ color: '#6366F1' }} className="d-block mb-1"><i className="bi bi-clock-history me-1"></i>Pending Work</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.pendingWork}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="tp-box-subtle">
                  <strong style={{ color: '#EF4444' }} className="d-block mb-1"><i className="bi bi-exclamation-triangle me-1"></i>Identified Risks</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.risks}</p>
                </div>
              </div>
              <div className="col-12">
                <div className="tp-box-highlight">
                  <strong style={{ color: '#A78BFA' }} className="d-block mb-1"><i className="bi bi-lightbulb me-1"></i>AI Strategic Recommendations</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.recommendations}</p>
                </div>
              </div>
            </div>
          )}

          {tab === "prioritize" && typeof result === "object" && result.priority && (
            <div className="tp-box-highlight">
              <div className="d-flex align-items-center gap-3 mb-3">
                <span className="fw-bold fs-5" style={{ color: 'var(--tp-text)' }}>Recommended Priority:</span>
                <span className={`badge ${getPriorityBadge(result.priority)} fs-6`}>{result.priority}</span>
              </div>
              <p className="mb-2" style={{ color: 'var(--tp-text)' }}><strong>Reasoning:</strong> {result.reason}</p>
              {result.suggestedDeadline && (
                <p className="mb-0 small" style={{ color: '#94A3B8' }}><strong>Suggested Completion Date:</strong> {result.suggestedDeadline}</p>
              )}
            </div>
          )}

          {tab === "risk" && Array.isArray(result) && (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr><th>Task Name</th><th>Risk Level</th><th>Risk Assessment</th></tr>
                </thead>
                <tbody>
                  {result.map((item, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--tp-text)', fontWeight: 500 }}>{item.taskTitle}</td>
                      <td><span className={`badge ${getRiskBadge(item.risk)}`}>{item.risk}</span></td>
                      <td style={{ color: '#94A3B8' }}>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "meeting" && typeof result === "object" && result.summary && (
            <div className="row g-3">
              <div className="col-12">
                <div className="tp-box-subtle mb-3">
                  <strong style={{ color: '#38BDF8' }} className="d-block mb-1"><i className="bi bi-chat-left-text me-1"></i>Meeting Summary</strong>
                  <p className="mb-0" style={{ color: 'var(--tp-text)' }}>{result.summary}</p>
                </div>
              </div>
              {result.decisions?.length > 0 && (
                <div className="col-md-6">
                  <div className="tp-box-subtle h-100">
                    <h6 className="fw-bold mb-2" style={{ color: '#22C55E' }}><i className="bi bi-check-circle me-1.5"></i>Key Decisions</h6>
                    <ul className="mb-0 ps-3" style={{ color: 'var(--tp-text)' }}>
                      {result.decisions.map((d, i) => <li key={i} className="mb-1">{d}</li>)}
                    </ul>
                  </div>
                </div>
              )}
              {result.actionItems?.length > 0 && (
                <div className="col-md-6">
                  <div className="tp-box-subtle h-100">
                    <h6 className="fw-bold mb-2" style={{ color: '#6366F1' }}><i className="bi bi-list-task me-1.5"></i>Action Items</h6>
                    <div className="d-flex flex-column gap-2">
                      {result.actionItems.map((item, i) => (
                        <div key={i} className="p-2 rounded d-flex justify-content-between align-items-center" style={{ background: 'var(--tp-surface-alt)', border: '1px solid var(--tp-glass-border)' }}>
                          <span className="small" style={{ color: 'var(--tp-text)' }}>{item.task}</span>
                          <span className="badge tp-badge-low ms-2">{item.assignee}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "suggest" && Array.isArray(result) && (
            <div className="row g-3">
              {result.map((s, i) => (
                <div key={i} className="col-md-6">
                  <div className="tp-box-subtle h-100 d-flex flex-column justify-content-between">
                    <div>
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="fw-bold mb-0" style={{ color: 'var(--tp-text)' }}>{s.title}</h6>
                        <span className={`badge ${getPriorityBadge(s.priority)}`}>{s.priority}</span>
                      </div>
                      <p className="small mb-0" style={{ color: '#94A3B8' }}>{s.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Gemini Chat Section */}
      <motion.div className="tp-glass p-4 mt-4" variants={itemVariants}>
        <h5 className="fw-bold mb-3" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <i className="bi bi-chat-left-text me-2" style={{ color: '#38BDF8' }}></i>Gemini Chat
        </h5>
        <div style={{ height: 250, overflowY: "auto", marginBottom: 12, background: 'var(--tp-surface-alt)', borderRadius: 12, padding: 12 }}>
          {chatMessages.length === 0 && (
            <div className="text-center py-3" style={{ color: '#94A3B8' }}>
              <p className="mb-0">Ask me anything about your projects, tasks, or analytics.</p>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`mb-2 ${msg.role === "user" ? "text-end" : ""}`}>
              <span className="badge" style={{
                background: msg.role === "user" ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(56, 189, 248, 0.2))' : 'rgba(56, 189, 248, 0.1)',
                color: 'var(--tp-text)', border: msg.role === "user" ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(56, 189, 248, 0.2)',
              }}>
                {msg.role === "user" ? "You" : "AI"}
              </span>
              <div className={`mt-1 p-2 rounded`} style={{
                display: "inline-block", maxWidth: "80%",
                background: msg.role === "user" ? 'rgba(99, 102, 241, 0.15)' : 'rgba(56, 189, 248, 0.05)',
                border: msg.role === "user" ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(56, 189, 248, 0.1)',
                color: 'var(--tp-text)', fontSize: '0.9rem',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatLoading && <div style={{ color: '#94A3B8' }}><i className="bi bi-hourglass-split" /> Thinking...</div>}
        </div>
        <div className="input-group">
          <input type="text" className="form-control" placeholder="Ask the AI assistant..."
            value={chatInput} onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
            disabled={chatLoading} />
          <button className="tp-btn-primary" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{ borderRadius: '0 12px 12px 0' }}>
            <i className="bi bi-send" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AIAssistant;
