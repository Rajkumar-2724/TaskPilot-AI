import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    projectType: { type: String, enum: ["Project", "InfrastructureProject"], default: "Project" },
    status: {
      type: String,
      enum: ["Planning", "Active", "On Hold", "Completed", "Cancelled"],
      default: "Planning",
    },
    startDate: { type: Date, default: Date.now },
    deadline: { type: Date },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

projectSchema.index({ owner: 1 });
projectSchema.index({ members: 1 });
projectSchema.index({ status: 1 });

export default mongoose.model("Project", projectSchema);
