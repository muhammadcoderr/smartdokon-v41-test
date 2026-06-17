const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["low_stock", "new_client", "unsold_product", "system", "danger"],
      required: true,
    },
    code: {
      type: String,
      default: "",
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "relatedModel", // Dynamic reference based on type
    },
    relatedModel: {
      type: String,
      enum: ["Product", "Client", "User", null],
    },
    action: {
      type: String,
      default: "",
    },
    actionStatus: {
      type: String,
      enum: ["pending", "completed", "expired", ""],
      default: "",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
