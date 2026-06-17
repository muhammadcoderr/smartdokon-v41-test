const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SmartRoadmapProgressSchema = new Schema(
  {
    year: {
      type: Number,
      required: true,
      min: 2020,
      max: 2100,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    taskProgress: {
      type: Map,
      of: Boolean,
      default: {},
    },
    completedAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

SmartRoadmapProgressSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.models.SmartRoadmapProgress || mongoose.model("SmartRoadmapProgress", SmartRoadmapProgressSchema);
