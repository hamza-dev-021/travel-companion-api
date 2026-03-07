import express from 'express';
import Budget from '../models/Budget.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Middleware to ensure user is authenticated for all budget routes
router.use(protect);

// Create a new budget
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      currency = 'USD',
      budgetData = {},
      expenses = {},
      customExpenses = []
    } = req.body;

    const newBudget = new Budget({
      user: userId,
      title: title || 'My Trip Budget',
      currency: currency || 'USD',
      totalBudget: budgetData.totalBudget || 0,
      duration: budgetData.duration || 1,
      destination: budgetData.destination || '',
      travelers: budgetData.travelers || 1,
      expenses: {
        accommodation: expenses.accommodation || 0,
        transportation: expenses.transportation || 0,
        food: expenses.food || 0,
        activities: expenses.activities || 0,
        shopping: expenses.shopping || 0,
        miscellaneous: expenses.miscellaneous || 0
      },
      customExpenses: customExpenses || []
    });

    const savedBudget = await newBudget.save();
    res.status(201).json(savedBudget);
  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ message: 'Error saving budget', error: error.message });
  }
});

// Get all budgets for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const budgets = await Budget.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ message: 'Error fetching budgets', error: error.message });
  }
});

// Update an existing budget
router.put('/:id', async (req, res) => {
  try {
    const budgetId = req.params.id;
    const userId = req.user.id;

    // Ensure the budget belongs to the user
    const budget = await Budget.findOne({ _id: budgetId, user: userId });

    if (!budget) {
      return res.status(404).json({ message: 'Budget not found or unauthorized' });
    }

    const {
      title,
      currency,
      budgetData = {},
      expenses = {},
      customExpenses = []
    } = req.body;

    // Update fields
    if (title) budget.title = title;
    if (currency) budget.currency = currency;

    if (budgetData.totalBudget !== undefined) budget.totalBudget = budgetData.totalBudget;
    if (budgetData.duration !== undefined) budget.duration = budgetData.duration;
    if (budgetData.destination !== undefined) budget.destination = budgetData.destination;
    if (budgetData.travelers !== undefined) budget.travelers = budgetData.travelers;

    // Update expenses
    budget.expenses = {
      accommodation: expenses.accommodation !== undefined ? expenses.accommodation : budget.expenses.accommodation,
      transportation: expenses.transportation !== undefined ? expenses.transportation : budget.expenses.transportation,
      food: expenses.food !== undefined ? expenses.food : budget.expenses.food,
      activities: expenses.activities !== undefined ? expenses.activities : budget.expenses.activities,
      shopping: expenses.shopping !== undefined ? expenses.shopping : budget.expenses.shopping,
      miscellaneous: expenses.miscellaneous !== undefined ? expenses.miscellaneous : budget.expenses.miscellaneous
    };

    // Update custom expenses
    if (customExpenses) {
      budget.customExpenses = customExpenses;
    }

    const updatedBudget = await budget.save();
    res.status(200).json(updatedBudget);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ message: 'Error updating budget', error: error.message });
  }
});

// Delete a budget
router.delete('/:id', async (req, res) => {
  try {
    const budgetId = req.params.id;
    const userId = req.user.id;

    const deletedBudget = await Budget.findOneAndDelete({ _id: budgetId, user: userId });

    if (!deletedBudget) {
      return res.status(404).json({ message: 'Budget not found or unauthorized' });
    }

    res.status(200).json({ message: 'Budget deleted successfully' });
  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ message: 'Error deleting budget', error: error.message });
  }
});

// Keeping the old calculate route for any backwards compatibility (though mostly handled by frontend now)
router.post('/calculate', (req, res) => {
  const { budgetData = {}, expenses = {}, customExpenses = [] } = req.body;

  const expenseValues = Object.values(expenses).map((val) => parseFloat(val) || 0);
  const customTotal = (customExpenses || []).reduce(
    (sum, exp) => sum + (parseFloat(exp.amount) || 0),
    0
  );
  const totalExpenses = expenseValues.reduce((sum, val) => sum + val, 0) + customTotal;

  const totalBudget = parseFloat(budgetData.totalBudget) || 0;
  const remaining = totalBudget - totalExpenses;

  let status = 'under';
  if (remaining === 0) status = 'exact';
  if (remaining < 0) status = 'over';

  return res.json({
    totalBudget,
    totalExpenses,
    remaining,
    status
  });
});

export default router;
