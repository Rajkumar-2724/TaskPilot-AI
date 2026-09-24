import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, refPath: "projectType" },
    projectType: { type: String, enum: ["Project", "InfrastructureProject"], default: "Project" },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    action: { type: String, required: true },
    details: { type: String, default: "" },
  },
  { timestamps: true }
);

activityLogSchema.index({ project: 1, projectType: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
