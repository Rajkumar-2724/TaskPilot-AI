import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { useSocket } from "../context/SocketContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const Chat = () => {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState("");
  const { socket } = useSocket();
  const { user } = useAuth();
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    api.get("/projects").then(({ data }) => {
      setProjects(data.projects || []);
      if (data.projects?.length) setActiveProject(data.projects[0]._id);
    });
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    api.get(`/messages/${activeProject}`).then(({ data }) => setMessages(data.messages));
    socket?.emit("project:join", activeProject);
    return () => socket?.emit("project:leave", activeProject);
  }, [activeProject, socket]);

  useEffect(() => {
    if (!socket) return;
    const handleMsg = (msg) => {
      if (msg.project === activeProject || msg.project?._id === activeProject) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    const handleTyping = ({ name, isTyping }) => setTypingUser(isTyping ? name : "");
    socket.on("chat:message", handleMsg);
    socket.on("chat:typing", handleTyping);
    return () => {
      socket.off("chat:message", handleMsg);
      socket.off("chat:typing", handleTyping);
    };
  }, [socket, activeProject]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    const active = projects.find((p) => p._id === activeProject);
    socket.emit("chat:send", { projectId: activeProject, text, projectType: active?.projectType || "Project" });
    setText("");
  };

  const handleTyping = (val) => {
    setText(val);
    socket?.emit("chat:typing", { projectId: activeProject, isTyping: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit("chat:typing", { projectId: activeProject, isTyping: false });
    }, 1200);
  };

  return (
    <motion.div style={{ height: "75vh" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="tp-glass p-3 mb-2 d-flex align-items-center gap-2">
        <i className="bi bi-chat-dots-fill" style={{ color: "var(--tp-accent, #6366F1)" }} />
        <select
          className="form-select"
          value={activeProject}
          onChange={(e) => setActiveProject(e.target.value)}
          disabled={!projects.length}
          style={{ maxWidth: 400, borderRadius: 12 }}
        >
          {!projects.length && <option value="">No projects available</option>}
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}{p.projectType === "InfrastructureProject" ? "  (Infra)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="d-flex flex-column">
        <div className="tp-glass p-3 flex-grow-1 overflow-auto mb-2" style={{ height: "58vh" }}>
          {messages.map((m) => (
            <div key={m._id} className={`d-flex mb-2 ${m.sender?._id === user?._id ? "justify-content-end" : ""}`}>
              <div
                className="p-2 px-3 rounded-4"
                style={{
                  maxWidth: "70%",
                  background: m.sender?._id === user?._id
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(56, 189, 248, 0.2))'
                    : 'rgba(255, 255, 255, 0.06)',
                  border: m.sender?._id === user?._id
                    ? '1px solid rgba(99, 102, 241, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {m.sender?._id !== user?._id && <div className="small fw-bold" style={{ color: '#38BDF8' }}>{m.sender?.name}</div>}
                <div style={{ color: 'var(--tp-text)' }}>{m.text}</div>
                <div className="small" style={{ color: '#94A3B8' }}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
          {typingUser && <div className="small fst-italic" style={{ color: '#94A3B8' }}>{typingUser} is typing...</div>}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendMessage} className="d-flex gap-2">
          <input className="form-control" placeholder="Type a message..." value={text} onChange={(e) => handleTyping(e.target.value)} disabled={!activeProject} />
          <button className="tp-btn-primary" disabled={!activeProject} style={{ borderRadius: 12, padding: '0.6rem 1.2rem' }}>
            <i className="bi bi-send" />
          </button>
        </form>
      </div>
    </motion.div>
  );
};

export default Chat;
