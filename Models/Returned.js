const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let ReturnedSchema = new Schema({
  name: {
    type: String,
  },
  clientname: {
    type: String,
  },
  sellername: {
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
}, { timestamps: true });

module.exports = mongoose.model("Returned", ReturnedSchema);