const mongoose = require('mongoose');

const handoverSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank'],
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false, 
    default: null    
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending' 
  },
  date: {
    type: Date,
    default: Date.now
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true
  }
}, {
  timestamps: true
});

const Handover = mongoose.models.Handover || mongoose.model('Handover', handoverSchema);
module.exports = Handover;
module.exports.HandoverSchema = handoverSchema;