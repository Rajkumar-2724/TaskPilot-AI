import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["Task", "Project", "InfrastructureProject"],
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reminderDay: {
      type: Number,
      enum: [0, 1, 2, 3],
      required: true,
    },
    dueDate: { type: Date, required: true },
    sentAt: { type: Date, default: Date.now },
    isSent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reminderSchema.index({ entityType: 1, entityId: 1, recipientId: 1, reminderDay: 1 }, { unique: true });

export default mongoose.model("Reminder", reminderSchema);
