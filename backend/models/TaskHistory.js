import mongoose from "mongoose";

const taskHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, refPath: "projectType" },
    projectType: { type: String, enum: ["Project", "InfrastructureProject"], default: "Project" },
    projectName: { type: String, default: "Unknown Project" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
    status: { type: String, enum: ["Completed"], default: "Completed" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dueDate: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

taskHistorySchema.index({ user: 1, completedAt: -1 });
taskHistorySchema.index({ task: 1, user: 1 }, { unique: true });
taskHistorySchema.index({ user: 1, priority: 1 });

export default mongoose.model("TaskHistory", taskHistorySchema);