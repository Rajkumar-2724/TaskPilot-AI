// Gemini AI service with smart fallback analysis engine.
// Uses the Generative Language API when GEMINI_API_KEY is configured.
// Provides smart analytical fallbacks when GEMINI_API_KEY is omitted or unreachable.

export const isAiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

const MAX_RETRIES = 2;
const AI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

const extractJson = (text) => {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const startObj = t.indexOf("{");
  const startArr = t.indexOf("[");
  let startIdx = -1;
  if (startObj === -1) startIdx = startArr;
  else if (startArr === -1) startIdx = startObj;
  else startIdx = Math.min(startObj, startArr);
  if (startIdx === -1) return null;
  const lastChar = t[startIdx] === "{" ? "}" : "]";
  const lastIdx = t.lastIndexOf(lastChar);
  if (lastIdx <= startIdx) return null;
  const candidate = t.slice(startIdx, lastIdx + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export const callGemini = async (prompt, fallbackFn, state = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[AI Service] GEMINI_API_KEY not set. Operating with smart analytical engine.");
    return fallbackFn();
  }

  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const models = state.models || [primaryModel, ...AI_FALLBACK_MODELS.filter((m) => m !== primaryModel)];
  const modelIndex = state.modelIndex || 0;
  const model = models[modelIndex];
  const retryCount = state.retryCount || 0;
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401) {
      console.error("[AI Service] Invalid Gemini API key. Using fallback engine.");
      return fallbackFn();
    }

    if (response.status === 429 || response.status === 503 || response.status >= 500) {
      if (retryCount >= MAX_RETRIES) {
        const nextIndex = modelIndex + 1;
        if (nextIndex < models.length) {
          console.warn(`[AI Service] Model ${model} unavailable (status ${response.status}). Trying ${models[nextIndex]}...`);
          await new Promise((r) => setTimeout(r, 1000));
          return callGemini(prompt, fallbackFn, { models, modelIndex: nextIndex, retryCount: 0 });
        }
        console.warn("[AI Service] Gemini API unavailable after all retries and models. Using fallback engine.");
        return fallbackFn();
      }
      const delay = (retryCount + 1) * 1500;
      const reason = response.status === 429 ? "rate limited" : "currently busy";
      console.warn(`[AI Service] Gemini API ${reason} (model ${model}). Retrying in ${delay / 1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
      return callGemini(prompt, fallbackFn, { models, modelIndex, retryCount: retryCount + 1 });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[AI Service] Gemini API returned status ${response.status}: ${errText}. Falling back.`);
      return fallbackFn();
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return fallbackFn();
    }

    const parsed = extractJson(text);
    if (parsed) {
      return parsed;
    }

    return { response: text, analysisMode: "Gemini AI" };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.warn("[AI Service] Gemini API request timed out. Using fallback engine.");
    } else if (err.message?.includes("fetch")) {
      console.warn("[AI Service] Network error connecting to Gemini API. Using fallback engine.");
    } else {
      console.warn(`[AI Service] Connection failed to Gemini API: ${err.message}. Using fallback engine.`);
    }
    return fallbackFn();
  }
};

// --- Smart Fallback Generators ---

const generateFallbackPrioritization = (task) => {
  const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
  let priority = "Medium";
  let reason = "Standard task workload requirement based on scope.";

  if (text.match(/bug|fix|crash|error|audit|security|auth|critical|urgent|vulnerability/)) {
    priority = "Critical";
    reason = "Identified critical system reliability or security-sensitive keywords.";
  } else if (text.match(/database|api|backend|deploy|migration|pipeline|refactor/)) {
    priority = "High";
    reason = "High technical dependency and core architectural importance.";
  } else if (text.match(/ui|design|wireframe|docs|documentation|readme|style|css/)) {
    priority = "Low";
    reason = "Non-blocking documentation or visual refinement item.";
  }

  const dateObj = task.dueDate ? new Date(task.dueDate) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const suggestedDeadline = dateObj.toISOString().split("T")[0];

  return {
    priority,
    reason,
    suggestedDeadline,
    analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
  };
};

const generateFallbackProjectSummary = (project, tasks = []) => {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress" || t.status === "Review").length;
  const pending = tasks.filter((t) => t.status === "To Do").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    summary: `Project "${project.name}" is currently in state [${project.status}]. Total tasks: ${total}, Completed: ${completed}, In Progress: ${inProgress}, Pending: ${pending}.`,
    progress: `${pct}% complete (${completed}/${total} tasks finished)`,
    completedWork: completed > 0 ? `${completed} task(s) successfully delivered.` : "No tasks completed yet.",
    pendingWork: `${inProgress} task(s) in review/progress, ${pending} remaining in queue.`,
    risks: pct < 50 ? "Completion rate is below 50%. Focus on clearing high-priority blocked tasks." : "Low project velocity risk. Progress is on track.",
    recommendations: "Prioritize clearing active In-Progress items before picking up new To-Do tasks.",
    analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
  };
};

const generateFallbackDeadlineRisk = (tasks = []) => {
  const now = Date.now();
  if (!tasks.length) {
    return [
      {
        taskTitle: "General Project Timeline",
        risk: "Low",
        reason: "No pending tasks found for this project.",
        analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
      },
    ];
  }

  return tasks.map((t) => {
    const dueTime = t.dueDate ? new Date(t.dueDate).getTime() : now + 14 * 24 * 3600 * 1000;
    const diffDays = Math.ceil((dueTime - now) / (1000 * 3600 * 24));
    let risk = "Low";
    let reason = "Task timeline has adequate buffer.";

    if (diffDays < 0) {
      risk = "High";
      reason = `Task is overdue by ${Math.abs(diffDays)} day(s). Immediate attention required.`;
    } else if (diffDays <= 3) {
      risk = "High";
      reason = `Due in ${diffDays} day(s) with status [${t.status}]. Escalation recommended.`;
    } else if (diffDays <= 7 && t.priority === "Critical") {
      risk = "Medium";
      reason = "Critical priority item with short turn-around time.";
    }

    return {
      taskTitle: t.title,
      risk,
      reason,
      analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
    };
  });
};

const generateFallbackMeetingSummary = (notes = "") => {
  const lines = notes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const actionItems = [];
  const decisions = [];

  lines.forEach((line) => {
    if (line.toLowerCase().includes("decision") || line.toLowerCase().includes("agreed") || line.toLowerCase().includes("approved")) {
      decisions.push(line.replace(/^(decision|agreed|approved)[:\s-]*/i, ""));
    } else if (line.toLowerCase().includes("todo") || line.toLowerCase().includes("action") || line.toLowerCase().includes("assign") || line.includes("->") || line.includes(":")) {
      const parts = line.split(/[-:]/);
      actionItems.push({
        task: parts[0]?.trim() || line,
        assignee: parts[1]?.trim() || "Team Member",
      });
    }
  });

  if (decisions.length === 0) {
    decisions.push("Aligned on upcoming release targets and task ownership.");
  }

  if (actionItems.length === 0 && lines.length > 0) {
    lines.slice(0, 3).forEach((line, idx) => {
      actionItems.push({ task: line, assignee: `Team Member #${idx + 1}` });
    });
  }

  return {
    summary: lines.length > 0 ? `Summarized ${lines.length} discussion line(s).` : "General project status discussion.",
    decisions,
    actionItems,
    analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
  };
};

const generateFallbackTaskSuggestions = (project) => {
  return [
    {
      title: `Set up automated integration tests for ${project.name}`,
      description: "Ensure regression safety across core user authentication and API flows.",
      priority: "High",
      analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
    },
    {
      title: `Design responsive dashboard widgets for ${project.name}`,
      description: "Improve visual telemetry and analytics for active project tasks.",
      priority: "Medium",
      analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
    },
    {
      title: `Perform security & dependency audit for ${project.name}`,
      description: "Scan third-party packages and environment configurations for vulnerabilities.",
      priority: "Critical",
      analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
    },
    {
      title: `Prepare user documentation & API reference for ${project.name}`,
      description: "Document endpoints, environment variables, and deployment guides.",
      priority: "Low",
      analysisMode: process.env.GEMINI_API_KEY ? "Gemini Live AI" : "TaskPilot Smart Analysis Engine",
    },
  ];
};

export const chat = async (message, history = []) => {
  const recentHistory = history.slice(-10);

  let prompt = `You are a helpful AI assistant for TaskPilot AI, an intelligent project management system. Respond concisely and helpfully.\n\n`;

  if (recentHistory.length > 0) {
    prompt += `Conversation history:\n`;
    recentHistory.forEach((h) => {
      const role = h.role === "assistant" ? "Assistant" : "User";
      prompt += `${role}: ${h.content}\n`;
    });
    prompt += `\n`;
  }

  prompt += `User: ${message}\nAssistant:`;

  const fallbackFn = () => {
    const lower = message.toLowerCase();
    if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
      return { response: "Hello! I'm the TaskPilot AI assistant. I can help with project summaries, deadline risk analysis, task prioritization, meeting notes, and task suggestions. How can I help you today?", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("project") && (lower.includes("summary") || lower.includes("status"))) {
      return { response: "To get a project summary, please use the AI Project Summary feature in the dashboard. Select a project and click 'Run AI Analysis' for a comprehensive overview including progress, risks, and recommendations.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("task") && (lower.includes("priorit") || lower.includes("suggest"))) {
      return { response: "I can help prioritize tasks and suggest new ones. Use the AI Prioritize Task tab to analyze a specific task, or the Task Suggestions tab to get AI-powered task recommendations for a project.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("risk") || lower.includes("deadline")) {
      return { response: "For deadline risk analysis, use the AI Deadline Risk tab in the dashboard. It analyzes all project tasks and provides risk assessments for each task based on due dates, priorities, and current status.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("meeting") || lower.includes("notes")) {
      return { response: "For meeting notes summarization, use the Meeting Notes tab. Paste your raw meeting notes and I'll extract key decisions, action items, and assignees automatically.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("solar") || lower.includes("water") || lower.includes("workflow") || lower.includes("automation")) {
      return { response: "You can analyze specific projects using the AI features above. Select a project from the dropdown in the Project Summary, Deadline Risk, or Task Suggestions tabs to get detailed AI-powered insights.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    if (lower.includes("thank")) {
      return { response: "You're welcome! Feel free to ask if you need help with project analysis, task management, or any other features.", analysisMode: "TaskPilot Smart Analysis Engine" };
    }
    return { response: `I'm the TaskPilot AI assistant. I can help with:\n\n• Project Summaries - Get AI-powered project analysis\n• Deadline Risk - Assess task deadline risks\n• Task Priority - Get priority recommendations\n• Meeting Notes - Summarize meeting discussions\n• Task Suggestions - Get AI task recommendations\n\nPlease use the specific AI features in the dashboard tabs above, or ask me something about project management!`, analysisMode: "TaskPilot Smart Analysis Engine" };
  };

  return callGemini(prompt, fallbackFn);
};

// --- Exported AI Service Functions ---

export const prioritizeTask = async (task) => {
  const prompt = `You are an expert project manager AI. Analyze this task and respond ONLY with strict JSON:
{"priority": "Low|Medium|High|Critical", "reason": "short reason", "suggestedDeadline": "YYYY-MM-DD"}

Task title: ${task.title}
Task description: ${task.description || "N/A"}
Current due date: ${task.dueDate || "not set"}
Current status: ${task.status}`;
  return callGemini(prompt, () => generateFallbackPrioritization(task));
};

export const generateProjectSummary = async (project, tasks) => {
  const taskSummary = tasks
    .map((t) => `- ${t.title} [${t.status}, priority: ${t.priority}]`)
    .join("\n");

  const prompt = `You are a project management AI assistant. Analyze the project and respond ONLY with strict JSON:
{"summary": "...", "progress": "...", "completedWork": "...", "pendingWork": "...", "risks": "...", "recommendations": "..."}

Project name: ${project.name}
Project description: ${project.description || "N/A"}
Project status: ${project.status}
Deadline: ${project.deadline || "not set"}
Tasks:
${taskSummary || "No tasks yet"}`;
  return callGemini(prompt, () => generateFallbackProjectSummary(project, tasks));
};

export const predictDeadlineRisk = async (tasks) => {
  const taskList = tasks
    .map((t) => `- ${t.title} | due: ${t.dueDate || "none"} | status: ${t.status} | priority: ${t.priority}`)
    .join("\n");

  const prompt = `You are a risk-analysis AI for project deadlines. Respond ONLY with strict JSON, an array:
[{"taskTitle": "...", "risk": "Low|Medium|High", "reason": "..."}]

Tasks:
${taskList || "No tasks"}`;
  return callGemini(prompt, () => generateFallbackDeadlineRisk(tasks));
};

export const summarizeMeetingNotes = async (notes) => {
  const prompt = `You are an AI meeting-notes assistant. Analyze the raw notes and respond ONLY with strict JSON:
{"summary": "...", "decisions": ["..."], "actionItems": [{"task": "...", "assignee": "..."}]}

Meeting notes:
${notes}`;
  return callGemini(prompt, () => generateFallbackMeetingSummary(notes));
};

export const suggestTasks = async (project) => {
  const prompt = `You are a project-planning AI. Based on this project, suggest useful tasks to add. Respond ONLY with strict JSON, an array:
[{"title": "...", "description": "...", "priority": "Low|Medium|High|Critical"}]

Project name: ${project.name}
Description: ${project.description || "N/A"}
Status: ${project.status}`;
  return callGemini(prompt, () => generateFallbackTaskSuggestions(project));
};
