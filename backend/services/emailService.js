import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const isConfigured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  console.log(`[Email] SMTP configured for ${process.env.SMTP_HOST}:${Number(process.env.SMTP_PORT) || 587}`);
}

export const isEmailConfigured = Boolean(isConfigured);

export const verifyEmailConfig = async () => {
  if (!transporter) {
    console.log("[Email] SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS to enable email delivery.");
    return { ok: false, reason: "SMTP not configured" };
  }
  try {
    await transporter.verify();
    console.log(`[Email] SMTP connection verified for ${process.env.SMTP_HOST}`);
    return { ok: true };
  } catch (err) {
    console.error(`[Email] SMTP verification failed: ${err.message}`);
    return { ok: false, reason: err.message };
  }
};

// Tracks the most recent send so failures are visible on /api/health instead of
// only in logs. Several callers historically ignored the { sent: false } result,
// which let a failed delivery look like a success to the user.
let lastSend = { sent: null, to: null, subject: null, reason: null, at: null };

// Gmail and some other consumer SMTP hosts block connections
// originating from cloud/datacenter IP ranges (Render, AWS, etc.).
// We sample each port 3 times so a transient timeout doesn't get
// reported as a hard block. "open" means >=2 of 3 succeeded.
const PORT_SAMPLES = 3;
const PORT_SAMPLE_GAP_MS = 2000;
const portProbe = {};

export const probeSmtpPorts = async () => {
  const host = process.env.SMTP_HOST;
  if (!host) return portProbe;

  const net = await import("net");
  const ports = [587, 465, 25];
  for (const port of ports) {
    let successes = 0;
    const samples = [];
    for (let s = 0; s < PORT_SAMPLES; s++) {
      const started = Date.now();
      const ok = await new Promise((resolve) => {
        const socket = net
          .createConnection({ host, port })
          .setTimeout(5000)
          .on("connect", () => { socket.destroy(); resolve(true); })
          .on("timeout", () => { socket.destroy(); resolve(false); })
          .on("error", () => { resolve(false); });
      });
      if (ok) successes++;
      samples.push(ok);
      if (s < PORT_SAMPLES - 1) await new Promise((r) => setTimeout(r, PORT_SAMPLE_GAP_MS));
    }
    const ok = successes >= 2;
    portProbe[port] = {
      ok,
      samples,
      successRate: `${successes}/${PORT_SAMPLES}`,
      error: ok ? null : "ETIMEDOUT (all samples failed)",
    };
  }
  console.log("[Email] SMTP port probe:", JSON.stringify(portProbe));
  return portProbe;
};

export const emailStatus = () => {
  const blocked = Object.values(portProbe).filter((p) => !p.ok).length;
  const allBlocked = blocked === Object.keys(portProbe).length;
  const transport = BREVO_API_KEY ? "Brevo REST API (HTTPS 443)" : (isConfigured ? "SMTP" : "none");
  return {
    configured: isConfigured || !!BREVO_API_KEY,
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    from: process.env.SMTP_FROM || null,
    brevoApiKeyPresent: !!BREVO_API_KEY,
    transport,
    portProbe,
    lastSend,
    hostReachable: !allBlocked,
    note: allBlocked
      ? "Outbound SMTP is blocked from this host. Set BREVO_API_KEY in the environment to use the Brevo REST API over HTTPS (port 443) instead — it is not affected by the SMTP block. See render.yaml and .env.example."
      : "SMTP is reachable; delivery should work.",
  };
};

// --- Brevo REST API over HTTPS (port 443 — never blocked by Render's
// free tier). Used as the primary path when BREVO_API_KEY is set.
// Falls back to SMTP below if no API key is present.
const BREVO_API_KEY = process.env.BREVO_API_KEY || null;
const BREVO_API_URL = "https://api.brevo.com/v3/sendEmail";

const brevoRequest = async ({ to, subject, html }) => {
  const body = JSON.stringify({
    sender: { name: "TaskPilot AI", email: process.env.SMTP_USER || "no-reply@taskpilot.ai" },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      BREVO_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": BREVO_API_KEY,
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ sent: true, messageId: parsed.messageId, code: res.statusCode });
            } else {
              reject(Object.assign(new Error(parsed.message || `Brevo ${res.statusCode}`), { statusCode: res.statusCode }));
            }
          } catch (e) {
            reject(new Error(`Brevo ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("Brevo API timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

// Build a transport for a specific port. Used so a failed primary
// port can fall back to the alternative without rebuilding a module.
const makeTransport = (port) =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

// Retry on transient transport errors (timeout, reset, refusal). If all
// attempts fail the caller still gets { sent: false }.
const MAX_SEND_ATTEMPTS = 2;
const RETRY_DELAY_MS = () => 1000;
const TRANSIENT = /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ECONNABORTED|EPROTO|Brevo API timeout/i;
const PORTS = [Number(process.env.SMTP_PORT) || 587, 465].filter((v, i, a) => a.indexOf(v) === i);

// Prefer the Brevo REST API when an API key is present — it uses
// HTTPS (port 443) and is not affected by the outbound SMTP block.
// Otherwise fall back to SMTP (works locally where ports aren't
// restricted).
export const sendEmail = async ({ to, subject, html }) => {
  if (!isConfigured && !BREVO_API_KEY) {
    const reason = "SMTP not configured";
    console.error(`[Email:disabled] Would send to ${to} | Subject: ${subject}`);
    lastSend = { sent: false, to, subject, reason, at: new Date().toISOString() };
    return { sent: false, reason };
  }

  let lastError = null;

  // Path 1: Brevo REST API over HTTPS (port 443)
  if (BREVO_API_KEY) {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        const info = await brevoRequest({ to, subject, html });
        console.log(`[Email:brevo-api] attempt ${attempt} To: ${to} | mid=${info.messageId}`);
        lastSend = { sent: true, port: 443, to, subject, reason: null, at: new Date().toISOString() };
        return { sent: true, messageId: info.messageId };
      } catch (err) {
        lastError = err;
        const transient = TRANSIENT.test(err.message || err.code || "");
        if (attempt < MAX_SEND_ATTEMPTS && transient) {
          console.warn(`[Email:brevo-api retry ${attempt}/${MAX_SEND_ATTEMPTS}] ${err.message}`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS()));
        } else {
          break;
        }
      }
    }
  }

  // Path 2: SMTP fallback (works where outbound SMTP is not blocked)
  if (isConfigured) {
    for (const port of PORTS) {
      const t = port === Number(process.env.SMTP_PORT || 587) ? transporter : makeTransport(port);
      for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
        try {
          const info = await t.sendMail({
            from: process.env.SMTP_FROM || "TaskPilot AI <no-reply@taskpilot.ai>",
            to,
            subject,
            html,
          });
          console.log(`[Email:smtp] port ${port} attempt ${attempt} To: ${to} | id=${info.messageId}`);
          lastSend = { sent: true, port, to, subject, reason: null, at: new Date().toISOString() };
          return { sent: true, messageId: info.messageId };
        } catch (err) {
          lastError = err;
          const transient = TRANSIENT.test(err.message || err.code || "");
          if (attempt < MAX_SEND_ATTEMPTS && transient) {
            console.warn(`[Email:port ${port} retry ${attempt}/${MAX_SEND_ATTEMPTS}] ${err.code || ""} ${err.message}`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS()));
          } else {
            break;
          }
        }
      }
    }
  }

  console.error(`[Email] send FAILED to ${to} | ${lastError?.message}`);
  const reason = `${lastError?.code || "ERROR"}: ${lastError?.message}`;
  lastSend = { sent: false, port: null, to, subject, reason, at: new Date().toISOString() };
  return { sent: false, reason };
};

// For flows where the emailed code IS the login/verification credential: a
// failed send must fail the request, never hand back a challenge that can
// never be satisfied.
export const sendEmailOrThrow = async (options) => {
  const result = await sendEmail(options);
  if (!result?.sent) {
    const error = new Error(
      `Could not send email to ${options.to}: ${result?.reason || "unknown SMTP error"}`
    );
    error.errorCode = "EMAIL_SEND_FAILED";
    error.smtpReason = result?.reason || null;
    throw error;
  }
  return result;
};

export const emailTemplates = {
  welcome: (name) => `<h2>Welcome to TaskPilot AI, ${name}!</h2><p>Your account has been created successfully.</p>`,
  emailVerification: (name, code, expiresInMin) =>
    `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#1E293B;">
      <div style="background:linear-gradient(135deg,#6366F1,#38BDF8);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:20px;">Verify your email</h2>
      </div>
      <div style="padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="font-size:15px;line-height:1.6;">Hi <b>${name}</b>, confirm your email address to activate your TaskPilot AI account.</p>
        <div style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#6366F1;background:#EEF2FF;padding:14px 22px;border-radius:12px;margin:12px 0;">${code}</div>
        <p style="font-size:14px;color:#64748B;">This code expires in <b>${expiresInMin} minutes</b>.</p>
        <p style="font-size:13px;color:#94A3B8;">If you did not create a TaskPilot AI account, you can safely ignore this email.</p>
      </div>
    </div>`,
  emailVerified: (name) =>
    `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#1E293B;">
      <div style="background:linear-gradient(135deg,#22C55E,#38BDF8);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:20px;">Email verified</h2>
      </div>
      <div style="padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="font-size:15px;line-height:1.6;">Hi <b>${name}</b>, your email is verified. You can now sign in with your email and password.</p>
        <p style="font-size:13px;color:#94A3B8;">Best regards,<br/>TaskPilot AI Team</p>
      </div>
    </div>`,
  loginOtp: (name, otp, expiresInMin) =>
    `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#1E293B;">
      <div style="background:linear-gradient(135deg,#6366F1,#38BDF8);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:20px;">🔐 TaskPilot AI Login Code</h2>
      </div>
      <div style="padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="font-size:15px;line-height:1.6;">Hi <b>${name}</b>, use the code below to complete your login. It expires in <b>${expiresInMin} minutes</b>.</p>
        <div style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#6366F1;background:#EEF2FF;padding:14px 22px;border-radius:12px;margin:12px 0;">${otp}</div>
        <p style="font-size:13px;color:#94A3B8;">If you didn't request this login, you can safely ignore this email.</p>
      </div>
    </div>`,
  taskAssigned: (name, taskTitle, taskDesc, projectName, priority, dueDate, status, assignedBy, taskLink) =>
    `<h3>Hi ${name},</h3><p>You have been assigned a new task.</p>
     <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px;">
       <tr><td style="padding:4px 0;color:#94A3B8;">Task Title:</td><td style="padding:4px 0;color:#F8FAFC;font-weight:600;">${taskTitle}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Description:</td><td style="padding:4px 0;color:#F8FAFC;">${taskDesc || "N/A"}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Project:</td><td style="padding:4px 0;color:#F8FAFC;">${projectName}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Priority:</td><td style="padding:4px 0;color:#F8FAFC;">${priority}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Due Date:</td><td style="padding:4px 0;color:#F8FAFC;">${dueDate}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Status:</td><td style="padding:4px 0;color:#F8FAFC;">${status}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Assigned By:</td><td style="padding:4px 0;color:#F8FAFC;">${assignedBy}</td></tr>
     </table>
     <p style="margin-top:16px;"><a href="${process.env.CLIENT_URL || "http://localhost:5173"}${taskLink}" style="background:linear-gradient(135deg,#6366F1,#38BDF8);color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Open Task in TaskPilot AI</a></p>
     <p>Best regards,<br/>TaskPilot AI Team</p>`,
  projectInvite: (name, projectName, projectDesc, addedBy, projectStatus, projectLink) =>
    `<h3>Hi ${name},</h3><p>You have been added to a new project.</p>
     <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px;">
       <tr><td style="padding:4px 0;color:#94A3B8;">Project Name:</td><td style="padding:4px 0;color:#F8FAFC;font-weight:600;">${projectName}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Description:</td><td style="padding:4px 0;color:#F8FAFC;">${projectDesc || "N/A"}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Added By:</td><td style="padding:4px 0;color:#F8FAFC;">${addedBy}</td></tr>
       <tr><td style="padding:4px 0;color:#94A3B8;">Status:</td><td style="padding:4px 0;color:#F8FAFC;">${projectStatus || "Active"}</td></tr>
     </table>
     <p style="margin-top:16px;"><a href="${process.env.CLIENT_URL || "http://localhost:5173"}${projectLink}" style="background:linear-gradient(135deg,#6366F1,#38BDF8);color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Open Project in TaskPilot AI</a></p>
     <p>Best regards,<br/>TaskPilot AI Team</p>`,
  deadlineReminder: (name, taskTitle, dueDate) =>
    `<h3>Hi ${name},</h3><p>Reminder: task <b>${taskTitle}</b> is due on ${new Date(dueDate).toDateString()}.</p>`,
  taskDeadlineReminder: (name, taskTitle, dueDate, daysRemaining, status, priority, projectName, taskLink) => {
    const priorityColors = { Low: "#22C55E", Medium: "#F59E0B", High: "#F97316", Critical: "#EF4444" };
    const statusColors = { "To Do": "#6B7280", "In Progress": "#3B82F6", Review: "#8B5CF6", Completed: "#22C55E" };
    return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#1E293B;">
      <div style="background:linear-gradient(135deg,#EF4444,#F97316);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:22px;">⏰ ${daysRemaining === 0 ? "Due TODAY" : "Deadline Reminder"}</h2>
        <p style="color:#fff;margin:8px 0 0;font-size:15px;">${daysRemaining === 0 ? "This task is due today!" : daysRemaining + " day" + (daysRemaining > 1 ? "s" : "") + " remaining"}</p>
      </div>
      <div style="padding:20px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
        <h3 style="color:#0F172A;margin:0 0 16px;">Hi ${name},</h3>
        <p style="font-size:15px;line-height:1.6;">Your task <b>${taskTitle}</b> in <b>${projectName}</b> is <b>${daysRemaining === 0 ? "due today" : "due in " + daysRemaining + " day" + (daysRemaining > 1 ? "s" : "")}</b>. Please complete it before the deadline.</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;width:120px;">Task</td><td style="padding:6px 0;color:#1E293B;">${taskTitle}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Project</td><td style="padding:6px 0;color:#1E293B;">${projectName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Due Date</td><td style="padding:6px 0;color:#1E293B;">${new Date(dueDate).toLocaleDateString("en-US",{timeZone:process.env.TIMEZONE||"Asia/Kolkata",weekday:"long",year:"numeric",month:"long",day:"numeric"})}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Status</td><td style="padding:6px 0;color:${statusColors[status]||"#1E293B"};font-weight:600;">${status}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Priority</td><td style="padding:6px 0;color:${priorityColors[priority]||"#1E293B"};font-weight:600;">${priority}</td></tr>
        </table>
        <div style="text-align:center;margin:20px 0;">
          <a href="${process.env.CLIENT_URL||"http://localhost:5173"}${taskLink}" style="background:linear-gradient(135deg,#6366F1,#38BDF8);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Open Task in TaskPilot AI</a>
        </div>
        <p style="font-size:14px;color:#64748B;margin-top:16px;">This is an automatic reminder. Please act promptly to avoid missing the deadline.</p>
        <p style="font-size:13px;color:#94A3B8;margin-top:8px;">Best regards,<br/>TaskPilot AI Team</p>
      </div>
    </div>`;
  },
  projectDeadlineReminder: (name, projectName, projectType, dueDate, daysRemaining, status, projectLink) => {
    const statusColors = { Planning: "#6B7280", Active: "#3B82F6", "On Hold": "#F59E0B", Suspended: "#EF4444", Completed: "#22C55E", Cancelled: "#6B7280" };
    return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#1E293B;">
      <div style="background:linear-gradient(135deg,#EF4444,#F97316);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:22px;">⏰ ${daysRemaining === 0 ? "Project Due TODAY" : "Project Deadline Reminder"}</h2>
        <p style="color:#fff;margin:8px 0 0;font-size:15px;">${daysRemaining === 0 ? "This project is due today!" : daysRemaining + " day" + (daysRemaining > 1 ? "s" : "") + " remaining"}</p>
      </div>
      <div style="padding:20px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
        <h3 style="color:#0F172A;margin:0 0 16px;">Hi ${name},</h3>
        <p style="font-size:15px;line-height:1.6;">The project <b>${projectName}</b> is <b>${daysRemaining === 0 ? "due today" : "due in " + daysRemaining + " day" + (daysRemaining > 1 ? "s" : "")}</b>. Please ensure all tasks are on track.</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;width:120px;">Project</td><td style="padding:6px 0;color:#1E293B;">${projectName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Type</td><td style="padding:6px 0;color:#1E293B;">${projectType}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Deadline</td><td style="padding:6px 0;color:#1E293B;">${new Date(dueDate).toLocaleDateString("en-US",{timeZone:process.env.TIMEZONE||"Asia/Kolkata",weekday:"long",year:"numeric",month:"long",day:"numeric"})}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;font-weight:600;">Status</td><td style="padding:6px 0;color:${statusColors[status]||"#1E293B"};font-weight:600;">${status}</td></tr>
        </table>
        <div style="text-align:center;margin:20px 0;">
          <a href="${process.env.CLIENT_URL||"http://localhost:5173"}${projectLink}" style="background:linear-gradient(135deg,#6366F1,#38BDF8);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Open Project in TaskPilot AI</a>
        </div>
        <p style="font-size:14px;color:#64748B;margin-top:16px;">This is an automatic reminder. Please ensure the project stays on schedule.</p>
        <p style="font-size:13px;color:#94A3B8;margin-top:8px;">Best regards,<br/>TaskPilot AI Team</p>
      </div>
    </div>`;
  },
};
