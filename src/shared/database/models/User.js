const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

let UserSchema = new Schema({
  firstname: {
    type: String,
    required: true
  },
  phone: {
    type: Number,
  },
  avatar: {
    type: String,
  },
  banner: {
    type: String,
  },
  login: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  status: {
    type: String,
  },
  type: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  permissions: {
    type: [String],
    default: []
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastseen: {
    type: Date,
    default: Date.now
  },
  refreshToken: {
    type: String,
    default: null
  },
  currencyPreference: {
    type: String,
    enum: ['UZS', 'USD'],
    default: 'UZS'
  },
  gender: {
    type: String,
    enum: ['Erkak', 'Ayol', ''],
    default: ''
  },
  branchId: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    index: true
  }
}, {
  timestamps: true
});

UserSchema.plugin(mongoosePaginate); // Plaginni qo'shish

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
