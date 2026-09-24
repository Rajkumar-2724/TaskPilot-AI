import asyncHandler from "express-async-handler";
import { answerQuestion } from "../services/assistantService.js";

// @desc    Ask the grounded Project Intelligence assistant
// @route   POST /api/assistant/query
export const queryAssistant = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) {
    res.status(400);
    throw new Error("Please provide a question/message.");
  }
  const result = await answerQuestion(req.user, message, req.body.history);
  res.json({ success: true, ...result });
});