import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "projectType" },
    projectType: { type: String, enum: ["Project", "InfrastructureProject"], required: true, default: "Project" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

messageSchema.index({ project: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
