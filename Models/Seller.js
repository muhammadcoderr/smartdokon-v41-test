const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

let SellerSchema = new Schema({
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
    enum: ['admin', 'sotuvchi'],
    default: 'sotuvchi'
  },
  permissions: {
    type: [String],
    default: []
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Seller'
  },
  lastseen: {
    type: Date,
    default: Date.now
  },
  refreshToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

SellerSchema.plugin(mongoosePaginate); // Plaginni qo'shish

module.exports = mongoose.model("Seller", SellerSchema);
