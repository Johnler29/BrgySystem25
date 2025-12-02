// ========================================
// FINANCIAL & BUDGET MANAGEMENT - SERVER ROUTES
// ========================================

const express = require('express');
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

module.exports = function(withDb, requireAuth, requireAdmin) {
  const router = express.Router();

  // ========================================
  // FILE UPLOAD CONFIGURATION
  // ========================================
  
  const getUploadsDir = () => {
    if (process.env.VERCEL) {
      return '/tmp/uploads';
    }
    return path.join(__dirname, '..', 'uploads');
  };

  const uploadsDir = getUploadsDir();
  
  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (err) {
      console.warn('[financial] Could not create uploads directory:', err.message);
    }
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'receipt-' + uniqueSuffix + ext);
    }
  });

  const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files (JPEG, PNG) and PDF files are allowed!'));
      }
    }
  });

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
  // BUDGET PLANNING (Enhanced with approvedBy and excessBudgetHandling)
  // ========================================

  router.get('/api/financial/budget-planning', requireAdmin, async (req, res) => {
    try {
      const records = await withDb(async (db) => {
        const plans = await db.collection('budgetPlanning')
          .find({}).sort({ year: -1 }).toArray();
        
        // Calculate total budget and validate against expenses
        return plans.map(plan => {
          const totalBudget = (plan.annualBudget || 0) + (plan.carryOver || 0);
          return {
            ...plan,
            totalBudget
          };
        });
      });

      res.json({ ok: true, records: records || [] });
    } catch (err) {
      console.error('Budget planning error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load budget plans' });
    }
  });

  router.post('/api/financial/budget-planning', requireAdmin, async (req, res) => {
    try {
      const { year, annualBudget, carryOver, status, notes, approvedBy, excessBudgetHandling } = req.body;

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
          approvedBy: approvedBy || '',
          excessBudgetHandling: excessBudgetHandling || '',
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
      const { year, annualBudget, carryOver, status, notes, approvedBy, excessBudgetHandling } = req.body;

      await withDb(async (db) => {
        const updateData = {
          year: parseInt(year),
          annualBudget: parseFloat(annualBudget) || 0,
          carryOver: parseFloat(carryOver) || 0,
          totalBudget: (parseFloat(annualBudget) || 0) + (parseFloat(carryOver) || 0),
          status: status || 'Pending',
          notes: notes || '',
          approvedBy: approvedBy || '',
          excessBudgetHandling: excessBudgetHandling || '',
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
  // EXPENSE MANAGEMENT (Enhanced with approvedBy dropdown, notedBy, receipt upload, validation)
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

  // Get available approvers list
  router.get('/api/financial/approvers', requireAdmin, async (req, res) => {
    try {
      const approvers = await withDb(async (db) => {
        // Get all admins and users who can approve expenses
        const users = await db.collection('users')
          .find({ role: { $in: ['admin', 'superadmin'] } })
          .project({ name: 1, username: 1 })
          .toArray();
        
        return users.map(u => ({
          value: u.name || u.username,
          label: u.name || u.username
        }));
      });

      res.json({ ok: true, approvers: approvers || [] });
    } catch (err) {
      console.error('Get approvers error:', err);
      res.status(500).json({ ok: false, message: 'Failed to load approvers' });
    }
  });

  // Receipt upload endpoint
  router.post('/api/financial/expense-management/upload-receipt', requireAdmin, upload.single('receipt'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'No file uploaded' });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ ok: true, fileUrl, filename: req.file.filename });
    } catch (err) {
      console.error('Receipt upload error:', err);
      res.status(500).json({ ok: false, message: 'Failed to upload receipt' });
    }
  });

  router.post('/api/financial/expense-management', requireAdmin, async (req, res) => {
    try {
      const { date, amount, category, description, approvedBy, notedBy, receiptUrl, budgetId } = req.body;

      await withDb(async (db) => {
        // Validate expense amount against budget availability
        if (budgetId) {
          const budget = await db.collection('budgetPlanning').findOne({ _id: new ObjectId(budgetId) });
          if (budget) {
            const expenses = await db.collection('expenseManagement')
              .find({ budgetId: budgetId })
              .toArray();
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const expenseAmount = parseFloat(amount) || 0;
            
            if (totalExpenses + expenseAmount > budget.totalBudget) {
              return res.status(400).json({ 
                ok: false, 
                message: `Expense amount exceeds available budget. Available: ₱${(budget.totalBudget - totalExpenses).toFixed(2)}, Requested: ₱${expenseAmount.toFixed(2)}` 
              });
            }
          }
        }

        // Validate against category allocation if category is provided
        if (category) {
          const allocations = await db.collection('fundAllocation')
            .find({ category: category, status: 'Approved' })
            .toArray();
          const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
          
          const categoryExpenses = await db.collection('expenseManagement')
            .find({ category: category })
            .toArray();
          const totalCategoryExpenses = categoryExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
          const expenseAmount = parseFloat(amount) || 0;
          
          if (totalCategoryExpenses + expenseAmount > totalAllocated) {
            return res.status(400).json({ 
              ok: false, 
              message: `Expense amount exceeds allocated budget for ${category}. Available: ₱${(totalAllocated - totalCategoryExpenses).toFixed(2)}, Requested: ₱${expenseAmount.toFixed(2)}` 
            });
          }
        }

        const newExpense = {
          date: new Date(date),
          amount: parseFloat(amount) || 0,
          category: category || '',
          description: description || '',
          approvedBy: approvedBy || '',
          notedBy: notedBy || '',
          receiptUrl: receiptUrl || '',
          receipt: !!receiptUrl,
          budgetId: budgetId || null,
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
      if (err.message && err.message.includes('exceeds')) {
        return res.status(400).json({ ok: false, message: err.message });
      }
      res.status(500).json({ ok: false, message: 'Failed to log expense' });
    }
  });

  router.put('/api/financial/expense-management/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { date, amount, category, description, approvedBy, notedBy, receiptUrl, budgetId } = req.body;

      await withDb(async (db) => {
        // Get existing expense
        const existingExpense = await db.collection('expenseManagement').findOne({ _id: new ObjectId(id) });
        if (!existingExpense) {
          return res.status(404).json({ ok: false, message: 'Expense not found' });
        }

        // Validate expense amount against budget availability
        if (budgetId) {
          const budget = await db.collection('budgetPlanning').findOne({ _id: new ObjectId(budgetId) });
          if (budget) {
            const expenses = await db.collection('expenseManagement')
              .find({ budgetId: budgetId, _id: { $ne: new ObjectId(id) } })
              .toArray();
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const expenseAmount = parseFloat(amount) || 0;
            
            if (totalExpenses + expenseAmount > budget.totalBudget) {
              return res.status(400).json({ 
                ok: false, 
                message: `Expense amount exceeds available budget. Available: ₱${(budget.totalBudget - totalExpenses).toFixed(2)}, Requested: ₱${expenseAmount.toFixed(2)}` 
              });
            }
          }
        }

        // Validate against category allocation if category is provided
        if (category) {
          const allocations = await db.collection('fundAllocation')
            .find({ category: category, status: 'Approved' })
            .toArray();
          const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
          
          const categoryExpenses = await db.collection('expenseManagement')
            .find({ category: category, _id: { $ne: new ObjectId(id) } })
            .toArray();
          const totalCategoryExpenses = categoryExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
          const expenseAmount = parseFloat(amount) || 0;
          
          if (totalCategoryExpenses + expenseAmount > totalAllocated) {
            return res.status(400).json({ 
              ok: false, 
              message: `Expense amount exceeds allocated budget for ${category}. Available: ₱${(totalAllocated - totalCategoryExpenses).toFixed(2)}, Requested: ₱${expenseAmount.toFixed(2)}` 
            });
          }
        }

        const updateData = {
          date: new Date(date),
          amount: parseFloat(amount) || 0,
          category: category || '',
          description: description || '',
          approvedBy: approvedBy || '',
          notedBy: notedBy || '',
          receiptUrl: receiptUrl || '',
          receipt: !!receiptUrl,
          budgetId: budgetId || null,
          updatedBy: req.session.user.name,
          updatedAt: new Date()
        };

        // Delete old receipt file if new one is uploaded
        if (receiptUrl && existingExpense.receiptUrl && existingExpense.receiptUrl !== receiptUrl) {
          const oldFilePath = path.join(uploadsDir, path.basename(existingExpense.receiptUrl));
          if (fs.existsSync(oldFilePath)) {
            try {
              fs.unlinkSync(oldFilePath);
            } catch (err) {
              console.warn('Could not delete old receipt file:', err.message);
            }
          }
        }

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
      if (err.message && err.message.includes('exceeds')) {
        return res.status(400).json({ ok: false, message: err.message });
      }
      res.status(500).json({ ok: false, message: 'Failed to update expense' });
    }
  });

  router.delete('/api/financial/expense-management/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await withDb(async (db) => {
        const expense = await db.collection('expenseManagement').findOne({ _id: new ObjectId(id) });
        
        // Delete receipt file if exists
        if (expense && expense.receiptUrl) {
          const filePath = path.join(uploadsDir, path.basename(expense.receiptUrl));
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.warn('Could not delete receipt file:', err.message);
            }
          }
        }

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
  // CASH ASSISTANCE (Enhanced with minAmount, maxAmount, dependsDetails)
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
      const { recipientName, amount, minAmount, maxAmount, type, dateRequested, status, disbursedDate, purpose, depends, dependsDetails } = req.body;

      await withDb(async (db) => {
        // Validate amount range if min/max are provided
        const expenseAmount = parseFloat(amount) || 0;
        if (minAmount && expenseAmount < parseFloat(minAmount)) {
          return res.status(400).json({ ok: false, message: `Amount must be at least ₱${minAmount}` });
        }
        if (maxAmount && expenseAmount > parseFloat(maxAmount)) {
          return res.status(400).json({ ok: false, message: `Amount must not exceed ₱${maxAmount}` });
        }

        // Validate depends option
        if (depends === 'true' || depends === true) {
          if (!dependsDetails || dependsDetails.trim() === '') {
            return res.status(400).json({ ok: false, message: 'Details/explanation is required when "Depends" option is selected' });
          }
        }

        const newAssistance = {
          recipientName: recipientName || '',
          amount: expenseAmount,
          minAmount: minAmount ? parseFloat(minAmount) : null,
          maxAmount: maxAmount ? parseFloat(maxAmount) : null,
          type: type || '',
          dateRequested: dateRequested ? new Date(dateRequested) : new Date(),
          status: status || 'Pending',
          disbursedDate: disbursedDate ? new Date(disbursedDate) : null,
          purpose: purpose || '',
          depends: depends === 'true' || depends === true,
          dependsDetails: dependsDetails || '',
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
      if (err.message && (err.message.includes('must be') || err.message.includes('required'))) {
        return res.status(400).json({ ok: false, message: err.message });
      }
      res.status(500).json({ ok: false, message: 'Failed to create cash assistance record' });
    }
  });

  router.put('/api/financial/cash-assistance/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { recipientName, amount, minAmount, maxAmount, type, dateRequested, status, disbursedDate, purpose, depends, dependsDetails } = req.body;

      await withDb(async (db) => {
        // Validate amount range if min/max are provided
        const expenseAmount = parseFloat(amount) || 0;
        if (minAmount && expenseAmount < parseFloat(minAmount)) {
          return res.status(400).json({ ok: false, message: `Amount must be at least ₱${minAmount}` });
        }
        if (maxAmount && expenseAmount > parseFloat(maxAmount)) {
          return res.status(400).json({ ok: false, message: `Amount must not exceed ₱${maxAmount}` });
        }

        // Validate depends option
        if (depends === 'true' || depends === true) {
          if (!dependsDetails || dependsDetails.trim() === '') {
            return res.status(400).json({ ok: false, message: 'Details/explanation is required when "Depends" option is selected' });
          }
        }

        const updateData = {
          recipientName: recipientName || '',
          amount: expenseAmount,
          minAmount: minAmount ? parseFloat(minAmount) : null,
          maxAmount: maxAmount ? parseFloat(maxAmount) : null,
          type: type || '',
          dateRequested: dateRequested ? new Date(dateRequested) : new Date(),
          status: status || 'Pending',
          disbursedDate: disbursedDate ? new Date(disbursedDate) : null,
          purpose: purpose || '',
          depends: depends === 'true' || depends === true,
          dependsDetails: dependsDetails || '',
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
      if (err.message && (err.message.includes('must be') || err.message.includes('required'))) {
        return res.status(400).json({ ok: false, message: err.message });
      }
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
  // REPORT GENERATION (Monthly, Quarterly, Yearly with PDF export)
  // ========================================

  // Generate report data
  router.post('/api/financial/reports/generate', requireAdmin, async (req, res) => {
    try {
      const { reportType, period, year, month, quarter } = req.body;

      const reportData = await withDb(async (db) => {
        let startDate, endDate;
        const currentYear = parseInt(year) || new Date().getFullYear();

        if (reportType === 'monthly') {
          const reportMonth = parseInt(month) || new Date().getMonth() + 1;
          startDate = new Date(currentYear, reportMonth - 1, 1);
          endDate = new Date(currentYear, reportMonth, 0, 23, 59, 59);
        } else if (reportType === 'quarterly') {
          const q = parseInt(quarter) || Math.floor((new Date().getMonth() + 3) / 3);
          const startMonth = (q - 1) * 3;
          startDate = new Date(currentYear, startMonth, 1);
          endDate = new Date(currentYear, startMonth + 3, 0, 23, 59, 59);
        } else if (reportType === 'yearly') {
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31, 23, 59, 59);
        } else {
          return res.status(400).json({ ok: false, message: 'Invalid report type' });
        }

        // Get budget data
        const budgetPlan = await db.collection('budgetPlanning')
          .findOne({ year: currentYear, status: { $in: ['Approved', 'Finalized'] } });

        // Get allocations
        const allocations = await db.collection('fundAllocation')
          .find({ status: 'Approved' }).toArray();

        // Get expenses in period
        const expenses = await db.collection('expenseManagement')
          .find({
            date: { $gte: startDate, $lte: endDate }
          })
          .sort({ date: -1 })
          .toArray();

        // Get cash assistance in period
        const cashAssistance = await db.collection('cashAssistance')
          .find({
            dateRequested: { $gte: startDate, $lte: endDate }
          })
          .sort({ dateRequested: -1 })
          .toArray();

        // Calculate totals
        const totalBudget = budgetPlan ? budgetPlan.totalBudget : 0;
        const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalAssistance = cashAssistance.reduce((sum, a) => sum + (a.amount || 0), 0);
        const remaining = totalBudget - totalExpenses;

        // Expenses by category
        const expensesByCategory = {};
        expenses.forEach(e => {
          if (!expensesByCategory[e.category]) {
            expensesByCategory[e.category] = 0;
          }
          expensesByCategory[e.category] += e.amount || 0;
        });

        return {
          reportType,
          period: period || `${reportType} ${currentYear}`,
          year: currentYear,
          startDate,
          endDate,
          budget: {
            total: totalBudget,
            allocated: totalAllocated,
            used: totalExpenses,
            remaining: remaining
          },
          expenses: {
            total: totalExpenses,
            count: expenses.length,
            byCategory: expensesByCategory,
            items: expenses
          },
          cashAssistance: {
            total: totalAssistance,
            count: cashAssistance.length,
            items: cashAssistance
          },
          allocations: allocations,
          generatedBy: req.session.user.name,
          generatedAt: new Date()
        };
      });

      // Save report to database
      await withDb(async (db) => {
        const reportRecord = {
          reportType: reportType,
          period: reportData.period,
          year: reportData.year,
          data: reportData,
          generatedBy: req.session.user.name,
          dateGenerated: new Date(),
          status: 'Generated'
        };

        await db.collection('financialReports').insertOne(reportRecord);

        // Audit log
        await db.collection('auditLog').insertOne({
          timestamp: new Date(),
          user: req.session.user.name,
          action: 'Generate',
          module: 'Reports',
          details: `Generated ${reportType} report for ${reportData.period}`
        });
      });

      res.json({ ok: true, reportData, message: 'Report generated successfully' });
    } catch (err) {
      console.error('Generate report error:', err);
      res.status(500).json({ ok: false, message: 'Failed to generate report' });
    }
  });

  // Generate PDF report
  router.get('/api/financial/reports/pdf/:reportId', requireAdmin, async (req, res) => {
    try {
      const { reportId } = req.params;

      const reportData = await withDb(async (db) => {
        const report = await db.collection('financialReports').findOne({ _id: new ObjectId(reportId) });
        return report ? report.data : null;
      });

      if (!reportData) {
        return res.status(404).json({ ok: false, message: 'Report not found' });
      }

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="financial-report-${reportData.period.replace(/\s+/g, '-')}.pdf"`);
      
      doc.pipe(res);

      // Header
      doc.fontSize(20).text('Financial Report', { align: 'center' });
      doc.fontSize(14).text(reportData.period, { align: 'center' });
      doc.moveDown();

      // Budget Summary
      doc.fontSize(16).text('Budget Summary', { underline: true });
      doc.fontSize(12);
      doc.text(`Total Budget: ₱${reportData.budget.total.toFixed(2)}`);
      doc.text(`Allocated: ₱${reportData.budget.allocated.toFixed(2)}`);
      doc.text(`Used: ₱${reportData.budget.used.toFixed(2)}`);
      doc.text(`Remaining: ₱${reportData.budget.remaining.toFixed(2)}`);
      doc.moveDown();

      // Expenses Summary
      doc.fontSize(16).text('Expenses Summary', { underline: true });
      doc.fontSize(12);
      doc.text(`Total Expenses: ₱${reportData.expenses.total.toFixed(2)}`);
      doc.text(`Number of Expenses: ${reportData.expenses.count}`);
      doc.moveDown();

      // Expenses by Category
      if (Object.keys(reportData.expenses.byCategory).length > 0) {
        doc.fontSize(14).text('Expenses by Category', { underline: true });
        doc.fontSize(12);
        Object.entries(reportData.expenses.byCategory).forEach(([category, amount]) => {
          doc.text(`${category}: ₱${amount.toFixed(2)}`);
        });
        doc.moveDown();
      }

      // Cash Assistance Summary
      doc.fontSize(16).text('Cash Assistance Summary', { underline: true });
      doc.fontSize(12);
      doc.text(`Total Assistance: ₱${reportData.cashAssistance.total.toFixed(2)}`);
      doc.text(`Number of Recipients: ${reportData.cashAssistance.count}`);
      doc.moveDown();

      // Footer
      doc.fontSize(10).text(`Generated by: ${reportData.generatedBy}`, { align: 'center' });
      doc.text(`Generated on: ${new Date(reportData.generatedAt).toLocaleString()}`, { align: 'center' });

      doc.end();
    } catch (err) {
      console.error('PDF generation error:', err);
      res.status(500).json({ ok: false, message: 'Failed to generate PDF' });
    }
  });

  // Get all reports
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
