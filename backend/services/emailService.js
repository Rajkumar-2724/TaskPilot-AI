import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

// Gmail and some other consumer SMTP hosts block connections originating from
// cloud/datacenter IP ranges (Render, AWS, etc.). A plain TCP probe tells us
// which ports are reachable at all, so a timeout can be told apart from bad
// credentials.
const portProbe = {};

export const probeSmtpPorts = async () => {
  const host = process.env.SMTP_HOST;
  if (!host) return portProbe;

  const net = await import("net");
  await Promise.all(
    [587, 465, 25].map(
      (port) =>
        new Promise((resolve) => {
          const started = Date.now();
          const socket = net
            .createConnection({ host, port })
            .setTimeout(8000)
            .on("connect", () => {
              portProbe[port] = { ok: true, ms: Date.now() - started, error: null };
              socket.destroy();
              resolve();
            })
            .on("timeout", () => {
              portProbe[port] = { ok: false, ms: null, error: "timeout" };
              socket.destroy();
              resolve();
            })
            .on("error", (err) => {
              portProbe[port] = { ok: false, ms: null, error: err.code || err.message };
              resolve();
            });
        })
    )
  );

  console.log("[Email] SMTP port probe:", JSON.stringify(portProbe));
  return portProbe;
};

export const emailStatus = () => ({
  configured: isEmailConfigured,
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  from: process.env.SMTP_FROM || null,
  portProbe,
  lastSend,
});

// Retry on transient transport errors (timeout, reset, refusal). If all
// attempts fail the caller still gets { sent: false }.
const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAY_MS = (attempt) => [0, 1000, 2500][attempt] ?? 3000;
const TRANSIENT = /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ECONNABORTED|EPROTO/i;

export const sendEmail = async ({ to, subject, html }) => {
  if (!transporter) {
    const reason = "SMTP not configured";
    console.error(`[Email:disabled] Would send to ${to} | Subject: ${subject}`);
    lastSend = { sent: false, to, subject, reason, at: new Date().toISOString() };
    return { sent: false, reason };
  }
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || "TaskPilot AI <no-reply@taskpilot.ai>",
        to,
        subject,
        html,
      });
      console.log(`[Email:sent] attempt ${attempt} To: ${to} | Subject: ${subject} | id=${info.messageId}`);
      lastSend = { sent: true, to, subject, reason: null, at: new Date().toISOString() };
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      const transient = TRANSIENT.test(err.message || err.code || "");
      if (attempt < MAX_SEND_ATTEMPTS && transient) {
        const ms = RETRY_DELAY_MS(attempt);
        console.warn(`[Email:retry ${attempt}/${MAX_SEND_ATTEMPTS}] ${err.code || ""} ${err.message} — waiting ${ms}ms`);
        await new Promise((r) => setTimeout(r, ms));
      } else {
        break;
      }
    }
  }
  console.error(`[Email] send FAILED after ${MAX_SEND_ATTEMPTS} attempts to ${to} | ${lastError?.code || ""} ${lastError?.message}`);
  const reason = `${lastError?.code || "ERROR"}: ${lastError?.message}`;
  lastSend = { sent: false, to, subject, reason, at: new Date().toISOString() };
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
