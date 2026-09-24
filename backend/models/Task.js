import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    project: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "projectType" },
    projectType: { type: String, enum: ["Project", "InfrastructureProject"], required: true, default: "Project" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
    status: { type: String, enum: ["To Do", "In Progress", "Review", "Completed"], default: "To Do" },
    startDate: { type: Date },
    dueDate: { type: Date },
    comments: [commentSchema],
    attachments: [attachmentSchema],
  },
  { timestamps: true }
);

taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, projectType: 1, status: 1 });
taskSchema.index({ project: 1, projectType: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ createdBy: 1 });

export default mongoose.model("Task", taskSchema);
