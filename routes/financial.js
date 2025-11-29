// ========================================
// FINANCIAL & BUDGET MANAGEMENT - SERVER ROUTES
// ========================================

const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = function(withDb, requireAuth, requireAdmin) {
  const router = express.Router();

  // ========================================
  // FINANCIAL SUMMARY
  // ========================================

  router.get('/api/financial/summary', requireAdmin, async (req, res) => {
    try {
      const summary = await withDb(async (db) => {
        // Get current year budget
        const currentYear = new Date().getFullYear();
        const budgetPlan = await db.collection('budgetPlanning')
          .findOne({ year: currentYear, status: { $in: ['Approved', 'Finalized'] } });

        // Get total allocated funds
        const allocations = await db.collection('fundAllocation')
          .find({ status: 'Approved' }).toArray();
        const budgetAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

        // Get total expenses
        const expenses = await db.collection('expenseManagement')
          .find({}).toArray();
        const budgetUsed = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        // Get pending approvals count
        const pendingApprovals = await db.collection('fundAllocation')
          .countDocuments({ status: 'Pending' });

        const totalBudget = budgetPlan ? budgetPlan.totalBudget : 0;
        const budgetRemaining = totalBudget - budgetUsed;

        return {
          totalBudget,
          budgetAllocated,
          budgetUsed,
          budgetRemaining,
          pendingApprovals
        };
      });

      res.json({ ok: true, summary });
    } catch (err) {
      console.error('Summary error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load summary' });
    }
  });

  // ========================================
  // CHARTS DATA
  // ========================================

  router.get('/api/financial/charts', requireAdmin, async (req, res) => {
    try {
      const data = await withDb(async (db) => {
        // Budget distribution by category
        const allocations = await db.collection('fundAllocation')
          .find({ status: 'Approved' }).toArray();

        const categoryMap = {};
        allocations.forEach(a => {
          if (!categoryMap[a.category]) categoryMap[a.category] = 0;
          categoryMap[a.category] += a.amount || 0;
        });

        const total = Object.values(categoryMap).reduce((sum, v) => sum + v, 0);
        const distribution = Object.entries(categoryMap).map(([category, amount]) => ({
          category,
          amount,
          percentage: total > 0 ? ((amount / total) * 100).toFixed(1) : 0
        }));

        // Monthly expenses (last 6 months)
        const expenses = await db.collection('expenseManagement')
          .find({}).sort({ date: -1 }).limit(100).toArray();

        const monthlyMap = {};
        expenses.forEach(e => {
          const date = new Date(e.date);
          const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          if (!monthlyMap[monthKey]) monthlyMap[monthKey] = 0;
          monthlyMap[monthKey] += e.amount || 0;
        });

        const monthlyExpenses = Object.entries(monthlyMap)
          .map(([month, amount]) => ({ month, amount }))
          .slice(0, 6)
          .reverse();

        return { distribution, monthlyExpenses };
      });

      res.json({ ok: true, ...data });
    } catch (err) {
      console.error('Charts error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load charts' });
    }
  });

  // ========================================
  // BUDGET PLANNING
  // ========================================

  router.get('/api/financial/budget-planning', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) => {
        const plans = await db.collection('budgetPlanning')
          .find({}).sort({ year: -1 }).toArray();
        
        // Calculate total budget for each plan
        return plans.map(plan => ({
          ...plan,
          totalBudget: (plan.annualBudget || 0) + (plan.carryOver || 0)
        }));
      });

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Budget planning error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load budget plans' });
    }
  });

  router.post('/api/financial/budget-planning', requireAdmin, async (req, res) => {
    try {
      const { year, annualBudget, carryOver, status, notes } = req.body;

      await withDb(async (db) => {
        // Check if budget plan for this year already exists
        const existing = await db.collection('budgetPlanning')
          .findOne({ year: parseInt(year) });

        if (existing) {
          return res.status(409).json({ ok: false, message: 'Budget plan for this year already exists' });
        }

        const newPlan = {
          year: parseInt(year),
          annualBudget: parseFloat(annualBudget) || 0,
          carryOver: parseFloat(carryOver) || 0,
          totalBudget: (parseFloat(annualBudget) || 0) + (parseFloat(carryOver) || 0),
          status: status || 'Pending',
          notes: notes || '',
          createdBy: req.session.user.name,
          createdAt: new Date()
        };

        await db.collection('budgetPlanning').insertOne(newPlan);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Create',
          module: 'Budget Planning',
          details: `Created budget plan for year ${year}`
        });
      });

      res.json({ ok: true, message: 'Budget plan created successfully' });
    } catch (err) {
      console.error('Create budget plan error:', err);
      res.status(500).json({ ok: false, message: 'Failed to create budget plan' });
    }
  });

  router.put('/api/financial/budget-planning/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { year, annualBudget, carryOver, status, notes } = req.body;

      await withDb(async (db) => {
        const updateData = {
          year: parseInt(year),
          annualBudget: parseFloat(annualBudget) || 0,
          carryOver: parseFloat(carryOver) || 0,
          totalBudget: (parseFloat(annualBudget) || 0) + (parseFloat(carryOver) || 0),
          status: status || 'Pending',
          notes: notes || '',
          updatedBy: req.session.user.name,
          updatedAt: new Date()
        };

        await db.collection('budgetPlanning').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Update',
          module: 'Budget Planning',
          details: `Updated budget plan ${id}`
        });
      });

      res.json({ ok: true, message: 'Budget plan updated successfully' });
    } catch (err) {
      console.error('Update budget plan error:', err);
      res.status(500).json({ ok: false, message: 'Failed to update budget plan' });
    }
  });

  router.delete('/api/financial/budget-planning/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        await db.collection('budgetPlanning').deleteOne({ _id: new ObjectId(id) });

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Delete',
          module: 'Budget Planning',
          details: `Deleted budget plan ${id}`
        });
      });

      res.json({ ok: true, message: 'Budget plan deleted successfully' });
    } catch (err) {
      console.error('Delete budget plan error:', err);
      res.status(500).json({ ok: false, message: 'Failed to delete budget plan' });
    }
  });

  // ========================================
  // FUND ALLOCATION
  // ========================================

  router.get('/api/financial/fund-allocation', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) =>
        db.collection('fundAllocation').find({}).sort({ dateCreated: -1 }).toArray()
      );

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Fund allocation error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load fund allocations' });
    }
  });

  router.post('/api/financial/fund-allocation', requireAdmin, async (req, res) => {
    try {
      const { category, amount, period, status, description } = req.body;

      await withDb(async (db) => {
        const newAllocation = {
          category: category || '',
          amount: parseFloat(amount) || 0,
          period: period || 'Monthly',
          status: status || 'Pending',
          description: description || '',
          createdBy: req.session.user.name,
          dateCreated: new Date()
        };

        await db.collection('fundAllocation').insertOne(newAllocation);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Create',
          module: 'Fund Allocation',
          details: `Created allocation for ${category}: ₱${amount}`
        });
      });

      res.json({ ok: true, message: 'Fund allocation created successfully' });
    } catch (err) {
      console.error('Create allocation error:', err);
      res.status(500).json({ ok: false, message: 'Failed to create allocation' });
    }
  });

  router.put('/api/financial/fund-allocation/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { category, amount, period, status, description } = req.body;

      await withDb(async (db) => {
        const updateData = {
          category: category || '',
          amount: parseFloat(amount) || 0,
          period: period || 'Monthly',
          status: status || 'Pending',
          description: description || '',
          updatedBy: req.session.user.name,
          updatedAt: new Date()
        };

        await db.collection('fundAllocation').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Update',
          module: 'Fund Allocation',
          details: `Updated allocation ${id}`
        });
      });

      res.json({ ok: true, message: 'Fund allocation updated successfully' });
    } catch (err) {
      console.error('Update allocation error:', err);
      res.status(500).json({ ok: false, message: 'Failed to update allocation' });
    }
  });

  router.delete('/api/financial/fund-allocation/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        await db.collection('fundAllocation').deleteOne({ _id: new ObjectId(id) });

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Delete',
          module: 'Fund Allocation',
          details: `Deleted allocation ${id}`
        });
      });

      res.json({ ok: true, message: 'Fund allocation deleted successfully' });
    } catch (err) {
      console.error('Delete allocation error:', err);
      res.status(500).json({ ok: false, message: 'Failed to delete allocation' });
    }
  });

  // ========================================
  // EXPENSE MANAGEMENT
  // ========================================

  router.get('/api/financial/expense-management', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) =>
        db.collection('expenseManagement').find({}).sort({ date: -1 }).toArray()
      );

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Expense management error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load expenses' });
    }
  });

  router.post('/api/financial/expense-management', requireAdmin, async (req, res) => {
    try {
      const { date, amount, category, description, approvedBy, receipt } = req.body;

      await withDb(async (db) => {
        const newExpense = {
          date: new Date(date),
          amount: parseFloat(amount) || 0,
          category: category || '',
          description: description || '',
          approvedBy: approvedBy || '',
          receipt: receipt === 'on' || receipt === true,
          createdBy: req.session.user.name,
          createdAt: new Date()
        };

        await db.collection('expenseManagement').insertOne(newExpense);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Create',
          module: 'Expense Management',
          details: `Logged expense: ${category} - ₱${amount}`
        });
      });

      res.json({ ok: true, message: 'Expense logged successfully' });
    } catch (err) {
      console.error('Create expense error:', err);
      res.status(500).json({ ok: false, message: 'Failed to log expense' });
    }
  });

  router.put('/api/financial/expense-management/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { date, amount, category, description, approvedBy, receipt } = req.body;

      await withDb(async (db) => {
        const updateData = {
          date: new Date(date),
          amount: parseFloat(amount) || 0,
          category: category || '',
          description: description || '',
          approvedBy: approvedBy || '',
          receipt: receipt === 'on' || receipt === true,
          updatedBy: req.session.user.name,
          updatedAt: new Date()
        };

        await db.collection('expenseManagement').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Update',
          module: 'Expense Management',
          details: `Updated expense ${id}`
        });
      });

      res.json({ ok: true, message: 'Expense updated successfully' });
    } catch (err) {
      console.error('Update expense error:', err);
      res.status(500).json({ ok: false, message: 'Failed to update expense' });
    }
  });

  router.delete('/api/financial/expense-management/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        await db.collection('expenseManagement').deleteOne({ _id: new ObjectId(id) });

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Delete',
          module: 'Expense Management',
          details: `Deleted expense ${id}`
        });
      });

      res.json({ ok: true, message: 'Expense deleted successfully' });
    } catch (err) {
      console.error('Delete expense error:', err);
      res.status(500).json({ ok: false, message: 'Failed to delete expense' });
    }
  });

  // ========================================
  // CASH ASSISTANCE
  // ========================================

  router.get('/api/financial/cash-assistance', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) =>
        db.collection('cashAssistance').find({}).sort({ dateRequested: -1 }).toArray()
      );

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Cash assistance error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load cash assistance records' });
    }
  });

  router.post('/api/financial/cash-assistance', requireAdmin, async (req, res) => {
    try {
      const { recipientName, amount, type, dateRequested, status, disbursedDate, purpose } = req.body;

      await withDb(async (db) => {
        const newAssistance = {
          recipientName: recipientName || '',
          amount: parseFloat(amount) || 0,
          type: type || '',
          dateRequested: dateRequested ? new Date(dateRequested) : new Date(),
          status: status || 'Pending',
          disbursedDate: disbursedDate ? new Date(disbursedDate) : null,
          purpose: purpose || '',
          createdBy: req.session.user.name,
          createdAt: new Date()
        };

        await db.collection('cashAssistance').insertOne(newAssistance);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Create',
          module: 'Cash Assistance',
          details: `Created assistance for ${recipientName}: ₱${amount}`
        });
      });

      res.json({ ok: true, message: 'Cash assistance record created successfully' });
    } catch (err) {
      console.error('Create cash assistance error:', err);
      res.status(500).json({ ok: false, message: 'Failed to create cash assistance record' });
    }
  });

  router.put('/api/financial/cash-assistance/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { recipientName, amount, type, dateRequested, status, disbursedDate, purpose } = req.body;

      await withDb(async (db) => {
        const updateData = {
          recipientName: recipientName || '',
          amount: parseFloat(amount) || 0,
          type: type || '',
          dateRequested: dateRequested ? new Date(dateRequested) : new Date(),
          status: status || 'Pending',
          disbursedDate: disbursedDate ? new Date(disbursedDate) : null,
          purpose: purpose || '',
          updatedBy: req.session.user.name,
          updatedAt: new Date()
        };

        await db.collection('cashAssistance').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Update',
          module: 'Cash Assistance',
          details: `Updated assistance ${id}`
        });
      });

      res.json({ ok: true, message: 'Cash assistance record updated successfully' });
    } catch (err) {
      console.error('Update cash assistance error:', err);
      res.status(500).json({ ok: false, message: 'Failed to update cash assistance record' });
    }
  });

  router.delete('/api/financial/cash-assistance/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        await db.collection('cashAssistance').deleteOne({ _id: new ObjectId(id) });

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Delete',
          module: 'Cash Assistance',
          details: `Deleted assistance ${id}`
        });
      });

      res.json({ ok: true, message: 'Cash assistance record deleted successfully' });
    } catch (err) {
      console.error('Delete cash assistance error:', err);
      res.status(500).json({ ok: false, message: 'Failed to delete cash assistance record' });
    }
  });

  // ========================================
  // REPORTS
  // ========================================

  router.get('/api/financial/reports', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) =>
        db.collection('financialReports').find({}).sort({ dateGenerated: -1 }).toArray()
      );

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Reports error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load reports' });
    }
  });

  router.post('/api/financial/reports', requireAdmin, async (req, res) => {
    try {
      const { reportType, period, generatedBy, status, notes } = req.body;

      await withDb(async (db) => {
        const newReport = {
          reportType: reportType || '',
          period: period || '',
          generatedBy: generatedBy || req.session.user.name,
          dateGenerated: new Date(),
          status: status || 'Draft',
          notes: notes || ''
        };

        await db.collection('financialReports').insertOne(newReport);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Generate',
          module: 'Reports',
          details: `Generated ${reportType} for ${period}`
        });
      });

      res.json({ ok: true, message: 'Report generated successfully' });
    } catch (err) {
      console.error('Create report error:', err);
      res.status(500).json({ ok: false, message: 'Failed to generate report' });
    }
  });

  router.put('/api/financial/reports/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { reportType, period, generatedBy, status, notes } = req.body;

      await withDb(async (db) => {
        const updateData = {
          reportType: reportType || '',
          period: period || '',
          generatedBy: generatedBy || req.session.user.name,
          status: status || 'Draft',
          notes: notes || '',
          updatedAt: new Date()
        };

        await db.collection('financialReports').updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Update',
          module: 'Reports',
          details: `Updated report ${id}`
        });
      });

      res.json({ ok: true, message: 'Report updated successfully' });
    } catch (err) {
      console.error('Update report error:', err);
      res.status(500).json({ ok: false, message: 'Failed to update report' });
    }
  });

  router.delete('/api/financial/reports/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        await db.collection('financialReports').deleteOne({ _id: new ObjectId(id) });

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Delete',
          module: 'Reports',
          details: `Deleted report ${id}`
        });
      });

      res.json({ ok: true, message: 'Report deleted successfully' });
    } catch (err) {
      console.error('Delete report error:', err);
      res.status(500).json({ ok: false, message: 'Failed to delete report' });
    }
  });

  // ========================================
  // AUDIT LOG
  // ========================================

  router.get('/api/financial/audit-log', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) =>
        db.collection('auditLog')
          .find({ module: { $in: ['Budget Planning', 'Fund Allocation', 'Expense Management', 'Cash Assistance', 'Reports'] } })
          .sort({ timestamp: -1 })
          .limit(500)
          .toArray()
      );

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Audit log error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load audit log' });
    }
  });

  return router;
};