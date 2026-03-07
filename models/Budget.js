import mongoose from 'mongoose';

const customExpenseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true }
});

const budgetSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        title: {
            type: String,
            required: true,
            default: 'My Trip Budget'
        },
        currency: {
            type: String,
            default: 'USD'
        },
        totalBudget: {
            type: Number,
            required: true,
            default: 0
        },
        duration: {
            type: Number,
            default: 1
        },
        destination: {
            type: String,
            trim: true
        },
        travelers: {
            type: Number,
            default: 1
        },
        expenses: {
            accommodation: { type: Number, default: 0 },
            transportation: { type: Number, default: 0 },
            food: { type: Number, default: 0 },
            activities: { type: Number, default: 0 },
            shopping: { type: Number, default: 0 },
            miscellaneous: { type: Number, default: 0 }
        },
        customExpenses: [customExpenseSchema]
    },
    { timestamps: true }
);

const Budget = mongoose.model('Budget', budgetSchema);

export default Budget;
