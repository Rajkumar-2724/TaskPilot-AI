import mongoose from "mongoose";

// Stores model evaluation metrics (shown on the Model Evaluation dashboard).
// One document per (modelName, metricName). Evaluation data is explicitly
// labelled because the current training dataset is demo/synthetic.
const modelMetricSchema = new mongoose.Schema(
  {
    modelName: { type: String, required: true, trim: true },
    modelVersion: { type: String, required: true, default: "1.0.0" },
    metricName: { type: String, required: true, trim: true },
    metricValue: { type: mongoose.Schema.Types.Mixed, required: true },
    datasetLabel: { type: String, default: "Demo/Synthetic Dataset" },
    datasetSize: { type: Number, default: 0 },
    comparisonGroup: { type: String, default: "ml" }, // "baseline" | "ml" | "cuf-only" | "extended"
    modelType: { type: String, default: "regression" }, // regression | classification
    trainingDate: { type: Date, default: Date.now },
    evaluationDate: { type: Date, default: Date.now },
    extra: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

modelMetricSchema.index({ modelName: 1, metricName: 1, modelVersion: 1 }, { unique: true });

const ModelMetric = mongoose.model("ModelMetric", modelMetricSchema);

export default ModelMetric;