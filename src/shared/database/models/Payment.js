const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let PaymentSchema = new Schema({
    products: [
        {
            productId: {
                type: String,
            },
            productName: {
                type: String,
            },
            quantity: {
                type: Number,
            },
            profit:{
                type: Number,
            },
            sellingPrice: {
                type: Number,
            },
            originalSellingPrice: {
                type: Number,
            },
            priceAdjustment: {
                type: Number,
            },
            discount:{
                type: Number,
            },
            category: {
                type:String,
                trim: true
            },
            unit: {
                type: String,
                trim: true,
            }
            
        }
    ],
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    clientName: {
        type: String,
    },
    userName: {
        type: String,
    },
    totalPrice: {
        type: Number,
    },
    discountPrice: {
        type: Number,
    },
    cash:{
        type: Number,
        min: 0
    },
    terminal:{
        type: Number,
        min: 0
    },
    cashback:{
        type: Number,
        min: 0
    },
    rate: {
        type: Number,
        min:0
    },
    indebtedness: {
        type: Number,
        min:0
    },
    date: {
        type: String,
    },
    status: {
        type: String,
    },
    profit: {
        type: Number
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        index: true
    }

},{timestamps: true})

PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ clientId: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ "products.productId": 1 });

module.exports = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
module.exports.PaymentSchema = PaymentSchema;
