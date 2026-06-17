const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let ReturnedSchema = new Schema({
  name: {
    type: String,
  },
  clientname: {
    type: String,
  },
  userName: {
    type: String,
  },
  avialable: {
    type: Number,
  },
  status: {
  type: String,
  enum: ["yaroqli", "yaroqsiz"],
  default: "yaroqli",
  },
  branchId: {
  type: Schema.Types.ObjectId,
  ref: "Branch",
  required: true,
  index: true,
  },
  }, { timestamps: true });

  module.exports = mongoose.models.Returned || mongoose.model("Returned", ReturnedSchema);
  module.exports.ReturnedSchema = ReturnedSchema;