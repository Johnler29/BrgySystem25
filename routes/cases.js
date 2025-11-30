// routes/cases.js
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

let multer;
try {
  // optional – used for evidence uploads
  multer = require('multer');
} catch {
  console.warn('[cases] multer not installed — run: npm i multer');
}

// ---- Upload utility functions ----
const getUploadDir = () => {
  // Check if we're in a serverless environment
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return '/tmp/uploads';
  }
  return path.join(process.cwd(), 'uploads');
};

const ensureUploadDir = () => {
  const uploadDir = getUploadDir();
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return { success: true, dir: uploadDir };
  } catch (err) {
    console.error('[cases] Failed to create upload directory:', err.message);
    return { success: false, error: err.message, dir: uploadDir };
  }
};

const verifyUploadedFile = (file) => {
  if (!file || !file.filename) {
    return { valid: false, error: 'Invalid file object' };
  }
  const uploadDir = getUploadDir();
  const filePath = path.join(uploadDir, file.filename);
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `File not found: ${file.filename}` };
    }
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { valid: false, error: `File is empty: ${file.filename}` };
    }
    return { valid: true, path: filePath, size: stats.size };
  } catch (err) {
    return { valid: false, error: `Error accessing file: ${err.message}` };
  }
};

const cleanupUploadedFiles = (files) => {
  if (!Array.isArray(files)) return;
  const uploadDir = getUploadDir();
  files.forEach(file => {
    if (file && file.filename) {
      try {
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[cases] Cleaned up file: ${file.filename}`);
        }
      } catch (err) {
        console.warn(`[cases] Failed to cleanup file ${file.filename}:`, err.message);
      }
    }
  });
};

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://adminDB:capstonelozonvill@barangaydb.5ootwqc.mongodb.net/barangayDB?retryWrites=true&w=majority';

async function withDb(fn) {
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI, { ignoreUndefined: true });
    const db = client.db();
    return await fn(db);
  } finally {
    if (client) await client.close();
  }
}

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  return res.status(403).json({ ok: false, message: 'Admin only.' });
}

// ---- Multer setup for evidence uploads ----
let upload = null;
if (multer) {
  // Ensure upload directory exists
  const dirCheck = ensureUploadDir();
  if (!dirCheck.success) {
    console.error('[cases] Cannot proceed without upload directory:', dirCheck.error);
  }

  const storage = multer.diskStorage({
    destination: (_, __, cb) => {
      try {
        const dirCheck = ensureUploadDir();
        if (!dirCheck.success) {
          return cb(new Error(`Upload directory not accessible: ${dirCheck.error}`));
        }
        cb(null, dirCheck.dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_, file, cb) => {
      const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext);
    }
  });

  upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  });
}

async function initCollections() {
  await withDb(async (db) => {
    const names = (await db.listCollections().toArray()).map(c => c.name);
    if (!names.includes('cases')) await db.createCollection('cases');
    if (!names.includes('counters')) await db.createCollection('counters');
    if (!names.includes('case_notifications')) await db.createCollection('case_notifications');

    const cases = db.collection('cases');
    await cases.createIndex({ caseId: 1 }, { unique: true });
    await cases.createIndex({ status: 1, dateOfIncident: 1, createdAt: 1 });
    await cases.createIndex({ typeOfCase: 1, priority: 1 });
    await cases.createIndex({ 'reportedBy.username': 1, createdAt: -1 });
    await cases.createIndex({ ongoingSince: 1, status: 1 });

    // ensure a counters doc exists (without touching `seq`)
    await db.collection('counters').updateOne(
      { _id: 'case' },
      { $setOnInsert: { prefix: 'C-' } },
      { upsert: true }
    );

    // indexes for notifications
    const notifs = db.collection('case_notifications');
    await notifs.createIndex(
      { 'user.username': 1, read: 1, createdAt: -1 },
      { name: 'user_read_createdAt' }
    );
    await notifs.createIndex({ caseId: 1 }, { name: 'by_case' });
  });
}
initCollections();

// ✅ FIX: do NOT set `seq` in $setOnInsert; only $inc it
async function nextCaseId(db) {
  const counters = db.collection('counters');
  const r = await counters.findOneAndUpdate(
    { _id: 'case' },
    { $inc: { seq: 1 }, $setOnInsert: { prefix: 'C-' } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = r.value || await counters.findOne({ _id: 'case' });
  const seq = (doc && typeof doc.seq === 'number') ? doc.seq : 1;
  const prefix = (doc && doc.prefix) || 'C-';
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ---- helpers for notifications / timelines ----
async function createCaseNotification(db, caseDoc, payload) {
  if (!caseDoc) return;
  const me = caseDoc.reportedBy || {};
  const user = {
    username: (me.username || '').toLowerCase(),
    name: me.name || ''
  };
  if (!user.username) return;

  const notifs = db.collection('case_notifications');
  const doc = {
    caseId: caseDoc._id,
    caseRef: caseDoc.caseId,
    type: payload.type || 'INFO',
    message: payload.message || '',
    meta: payload.meta || null,
    user,
    read: false,
    createdAt: new Date()
  };
  await notifs.insertOne(doc);
}

function toCsv(rows) {
  const header = [
    'caseId','status','typeOfCase','reportedBy','createdAt','dateOfIncident',
    'placeOfIncident','complainantName','complainantAddress','respondentName'
  ];
  const escape = v => {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };
  const lines = [header.join(',')];
  rows.forEach(r => {
    lines.push([
      r.caseId,
      r.status,
      r.typeOfCase,
      r.reportedBy?.name || r.reportedBy?.username || '',
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      r.dateOfIncident ? new Date(r.dateOfIncident).toISOString() : '',
      r.placeOfIncident || '',
      r.complainant?.name || '',
      r.complainant?.address || '',
      r.respondent?.name || ''
    ].map(escape).join(','));
  });
  return lines.join('\n');
}

const CASE_TYPES = [
  'Noise Complaint','Theft','Physical Assault','Trespassing','Lost Item','Vandalism',
  'Domestic Dispute','Harassment','Public Disturbance','Curfew Violation','Others'
];

const CASE_STATUSES = ['Reported', 'Ongoing', 'Hearing', 'Resolved', 'Cancelled'];
const CASE_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const HARASSMENT_TYPES = [
  'Verbal',
  'Physical',
  'Sexual',
  'Online / Cyber',
  'Bullying',
  'Stalking',
  'Other'
];
const SENIOR_CATEGORIES = [
  'Complainant',
  'Respondent',
  'Both',
  'Witness'
];

module.exports = function mountCases(app) {
  app.get('/cases', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'cases.html'));
  });

  app.get('/api/case-types', requireAuth, (req, res) => {
    res.json({ ok: true, items: CASE_TYPES });
  });

  // fast counters for the header stats
  app.get('/api/cases/summary', requireAuth, async (req, res) => {
    const summary = await withDb(async (db) => {
      const rows = await db.collection('cases').aggregate([
        { $group: { _id: '$status', n: { $sum: 1 } } }
      ]).toArray();
      const out = {
        Total: 0,
        Reported: 0,
        Ongoing: 0,
        Hearing: 0,
        Resolved: 0,
        Cancelled: 0
      };
      rows.forEach(r => {
        const raw = r._id || '';
        const mapped = raw === 'Pending' ? 'Reported' : raw;
        if (Object.prototype.hasOwnProperty.call(out, mapped)) {
          out[mapped] += r.n;
        }
        out.Total += r.n;
      });
      return out;
    });
    res.json({ ok: true, summary });
  });

  app.get('/api/cases', requireAuth, async (req, res) => {
    const {
      page = '1',
      limit = '10',
      status = '',
      q = '',
      from = '',
      to = '',
      mine = 'false',
      sort = 'desc',
      exportCsv = '',
      type = '',
      priority = '',
      harassmentType = '',
      seniorCategory = ''
    } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const query = {};
    
    // Check if user is admin
    const me = req.session.user;
    const isAdmin = /^(admin)$/i.test(me?.role||'') || me?.isAdmin===true || me?.type==='admin' || me?.accountType==='admin';
    
    // For non-admin users, automatically filter to show only their cases
    if (!isAdmin) {
      query['reportedBy.username'] = me?.username?.toLowerCase();
    } else if (mine === 'true') {
      // Admins can use the "mine" filter if they want
      query['reportedBy.username'] = me?.username?.toLowerCase();
    }

    if (status) query.status = status;
    if (from || to) {
      query.dateOfIncident = {};
      if (from) query.dateOfIncident.$gte = new Date(from);
      if (to) { const t = new Date(to); t.setHours(23,59,59,999); query.dateOfIncident.$lte = t; }
    }
    if (type) {
      query.typeOfCase = type;
    }
    if (priority) {
      query.priority = priority;
    }
    if (harassmentType) {
      query.harassmentType = harassmentType;
    }
    if (seniorCategory) {
      query.seniorCategory = seniorCategory;
    }
    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      query.$or = [
        { caseId: rx }, { typeOfCase: rx },
        { 'complainant.name': rx }, { 'respondent.name': rx },
        { 'reportedBy.name': rx }
      ];
    }

    const data = await withDb(async (db) => {
      const col = db.collection('cases');
      const cursor = col.find(query).sort({ createdAt: sort === 'asc' ? 1 : -1 });

      if (exportCsv === 'true') {
        const rows = await cursor.toArray();
        return { csv: toCsv(rows) };
      }

      const total = await col.countDocuments(query);
      const rows = await cursor.skip((p-1)*l).limit(l).toArray();
      return { rows, total, p, l };
    });

    if (data.csv !== undefined) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cases.csv"');
      return res.send(data.csv);
    }

    const totalPages = Math.max(1, Math.ceil((data.total || 0)/data.l));
    res.json({ ok:true, rows: data.rows || [], total: data.total || 0, page: data.p, limit: data.l, totalPages });
  });

  app.get('/api/cases/:id', requireAuth, async (req, res) => {
    const result = await withDb(async (db) => {
      const col = db.collection('cases');
      const row = await col.findOne({ _id: new ObjectId(req.params.id) });
      if (!row) return null;

      // 45‑day note for ongoing cases
      if (row.status === 'Ongoing') {
        const base = row.ongoingSince || row.updatedAt || row.createdAt;
        if (base) {
          const now = new Date();
          const days = Math.floor((now - new Date(base)) / (1000 * 60 * 60 * 24));
          if (days >= 45) {
            row.over45Note = `This case has been ongoing for ${days} days (since ${new Date(base).toLocaleDateString()}).`;
            if (!row.over45Notified) {
              await col.updateOne(
                { _id: row._id },
                { $set: { over45Notified: true } }
              );
              await createCaseNotification(db, row, {
                type: 'OVERDUE_45_DAYS',
                message: 'Case has been ongoing for 45 days or more.'
              });
              row.over45Notified = true;
            }
          }
        }
      }

      return row;
    });
    if (!result) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, row: result });
  });

  // Create a case with evidence uploads
  app.post('/api/cases', requireAuth, (req, res) => {
    if (!upload) {
      return res.status(501).json({
        ok: false,
        message: 'File upload disabled. Please ask the administrator to install multer (npm i multer).'
      });
    }

    const fields = upload.fields([
      { name: 'evidenceFiles', maxCount: 10 },
      { name: 'medicoLegalFile', maxCount: 2 },
      { name: 'vandalismImage', maxCount: 10 }
    ]);

    fields(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ ok: false, message: err.message });
      }

      try {
        const b = req.body || {};
        if (
          !b.typeOfCase ||
          !b.dateOfIncident ||
          !b.description ||
          !b.complainantName ||
          !b.complainantAddress
        ) {
          return res.status(400).json({ ok:false, message:'Please fill all required fields.' });
        }

        const typeOfCase = String(b.typeOfCase).trim();
        const priority = CASE_PRIORITIES.includes(b.priority)
          ? b.priority
          : 'Medium';

        // Harassment extra field
        let harassmentType = null;
        if (typeOfCase === 'Harassment') {
          const ht = String(b.harassmentType || '').trim();
          if (!ht) {
            return res.status(400).json({ ok:false, message:'Please select a harassment type.' });
          }
          if (!HARASSMENT_TYPES.includes(ht)) {
            return res.status(400).json({ ok:false, message:'Invalid harassment type.' });
          }
          harassmentType = ht;
        }

        // Senior-involved category (optional)
        let seniorCategory = String(b.seniorCategory || '').trim();
        if (seniorCategory && !SENIOR_CATEGORIES.includes(seniorCategory)) {
          return res.status(400).json({ ok:false, message:'Invalid senior-involved category.' });
        }
        if (!seniorCategory) seniorCategory = null;
        const seniorInvolved = !!seniorCategory;

        const files = req.files || {};
        const general = files.evidenceFiles || [];
        const medico = files.medicoLegalFile || [];
        const vandal = files.vandalismImage || [];

        // Case-type-specific requirements
        if (typeOfCase === 'Physical Assault' && medico.length === 0) {
          return res.status(400).json({
            ok: false,
            message: 'For Physical Assault cases, a medico-legal or physical exam file is required.'
          });
        }
        if (typeOfCase === 'Vandalism' && vandal.length === 0) {
          return res.status(400).json({
            ok: false,
            message: 'For Vandalism cases, at least one image proof is required.'
          });
        }

        const now = new Date();
        const me = req.session.user || {};
        const uploader = {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        };

        const evidences = [];
        const allFiles = [...general, ...medico, ...vandal];
        const failedFiles = [];

        // Validate all files before processing
        for (const file of allFiles) {
          const verification = verifyUploadedFile(file);
          if (!verification.valid) {
            failedFiles.push({ file, error: verification.error });
            console.error(`[cases] File validation failed for ${file.originalname}: ${verification.error}`);
          } else {
            console.log(`[cases] File validated: ${file.originalname} (${verification.size} bytes)`);
          }
        }

        // If any files failed validation, cleanup and return error
        if (failedFiles.length > 0) {
          cleanupUploadedFiles(allFiles);
          const errorMsg = failedFiles.length === 1 
            ? `File upload failed: ${failedFiles[0].error}. Please try uploading again.`
            : `Multiple file uploads failed. Please check your files and try again.`;
          return res.status(400).json({
            ok: false,
            message: errorMsg,
            details: process.env.NODE_ENV === 'development' ? failedFiles.map(f => f.error) : undefined
          });
        }

        // All files are valid, proceed with evidence creation
        const pushEvidence = (file, kind) => {
          evidences.push({
            _id: new ObjectId(),
            kind,
            filename: file.originalname,
            url: '/uploads/' + file.filename,
            uploadedAt: now,
            uploadedBy: uploader
          });
        };

        general.forEach(f => pushEvidence(f, 'evidence'));
        medico.forEach(f => pushEvidence(f, 'medicoLegal'));
        vandal.forEach(f => pushEvidence(f, 'vandalismImage'));

        if (evidences.length < 3) {
          cleanupUploadedFiles(allFiles);
          return res.status(400).json({
            ok: false,
            message: 'Please upload at least 3 evidence files.'
          });
        }

        const row = await withDb(async (db) => {
          const cases = db.collection('cases');
          const caseId = await nextCaseId(db);
          const when = new Date();
          const status = 'Reported';

          const doc = {
            caseId,
            status,
            typeOfCase,
            description: b.description,
            placeOfIncident: b.placeOfIncident || '',
            dateOfIncident: new Date(b.dateOfIncident),
            complainant: {
              name: b.complainantName,
              address: b.complainantAddress,
              contact: b.complainantContact || ''
            },
            respondent: {
              name: b.respondentName || '',
              address: b.respondentAddress || '',
              contact: b.respondentContact || ''
            },
            reportedBy: uploader,
            priority,
            harassmentType,
            seniorCategory,
            seniorInvolved,
            evidences,
            hearings: [],
            patawagForms: [],
            statusHistory: [
              {
                _id: new ObjectId(),
                status,
                at: when,
                by: uploader
              }
            ],
            resolveDate: null,
            cancelDate: null,
            cancellationReason: '',
            createdAt: when,
            updatedAt: when
          };

          await cases.insertOne(doc);
          return doc;
        });

        res.json({ ok:true, row });
      } catch (e) {
        console.error('Create case error:', e);
        
        // Cleanup uploaded files on error
        try {
          const files = req.files || {};
          const allFiles = [
            ...(files.evidenceFiles || []),
            ...(files.medicoLegalFile || []),
            ...(files.vandalismImage || [])
          ];
          cleanupUploadedFiles(allFiles);
        } catch (cleanupError) {
          console.error('[cases] Error during file cleanup:', cleanupError);
        }

        // Provide more descriptive error message
        const errorMessage = e.code === 'ENOENT' 
          ? 'File upload failed. Please check that the upload directory is accessible.'
          : e.message || 'Failed to create case. Please try again.';
        
        res.status(500).json({ 
          ok: false, 
          message: errorMessage,
          ...(process.env.NODE_ENV === 'development' && { details: e.stack })
        });
      }
    });
  });

  app.post('/api/cases/:id/status', requireAuth, requireAdmin, async (req, res) => {
    const { status, note = '', cancellationReason = '' } = req.body || {};
    const normalized = status === 'Pending' ? 'Reported' : status;
    if (!CASE_STATUSES.includes(normalized)) {
      return res.status(400).json({ ok:false, message:'Invalid status' });
    }

    const updated = await withDb(async (db) => {
      const col = db.collection('cases');
      const _id = new ObjectId(req.params.id);
      const existing = await col.findOne({ _id });
      if (!existing) return null;

      const now = new Date();
      const me = {
        username: (req.session.user?.username || '').toLowerCase(),
        name: req.session.user?.name || ''
      };

      const set = {
        status: normalized,
        updatedAt: now
      };

      if (normalized === 'Ongoing' && !existing.ongoingSince) {
        set.ongoingSince = now;
        set.over45Notified = false;
      }
      if (normalized === 'Resolved' && !existing.resolveDate) {
        set.resolveDate = now;
      }
      if (normalized === 'Cancelled') {
        set.cancelDate = existing.cancelDate || now;
        set.cancellationReason = String(cancellationReason || existing.cancellationReason || '').trim();
      }

      const historyEntry = {
        _id: new ObjectId(),
        status: normalized,
        at: now,
        by: me
      };
      if (note && String(note).trim()) historyEntry.note = String(note).trim();

      await col.updateOne(
        { _id },
        {
          $set: set,
          $push: { statusHistory: historyEntry }
        }
      );

      const row = await col.findOne({ _id });
      await createCaseNotification(db, row, {
        type: 'STATUS_CHANGE',
        message: `Case status updated to ${normalized}.`
      });
      if (normalized === 'Cancelled') {
        await createCaseNotification(db, row, {
          type: 'CANCELLED',
          message: 'Case has been cancelled.'
        });
      }
      return row;
    });

    if (!updated) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, row: updated });
  });

  app.delete('/api/cases/:id', requireAuth, requireAdmin, async (req, res) => {
    await withDb(async (db) => db.collection('cases').deleteOne({ _id: new ObjectId(req.params.id) }));
    res.json({ ok:true });
  });

  // --- Hearing schedule (linked to case) ---
  app.post('/api/cases/:id/hearings', requireAuth, requireAdmin, async (req, res) => {
    const { dateTime = '', venue = '', notes = '' } = req.body || {};
    if (!dateTime) {
      return res.status(400).json({ ok:false, message:'Hearing date/time is required.' });
    }
    const dt = new Date(dateTime);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ ok:false, message:'Invalid hearing date/time.' });
    }

    const result = await withDb(async (db) => {
      const col = db.collection('cases');
      const _id = new ObjectId(req.params.id);
      const row = await col.findOne({ _id });
      if (!row) return null;

      const now = new Date();
      const me = {
        username: (req.session.user?.username || '').toLowerCase(),
        name: req.session.user?.name || ''
      };
      const hearing = {
        _id: new ObjectId(),
        dateTime: dt,
        venue: String(venue || '').trim(),
        notes: String(notes || '').trim(),
        createdAt: now,
        createdBy: me
      };

      await col.updateOne(
        { _id },
        {
          $push: { hearings: hearing },
          $set: { updatedAt: now }
        }
      );

      const updated = await col.findOne({ _id });
      await createCaseNotification(db, updated, {
        type: 'HEARING_SCHEDULED',
        message: `Hearing scheduled on ${dt.toLocaleString()} at ${hearing.venue || 'Barangay Hall'}.`
      });
      return { updated, hearing };
    });

    if (!result) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, row: result.updated, hearing: result.hearing });
  });

  // --- Patawag form (ongoing cases only) ---
  app.post('/api/cases/:id/patawag', requireAuth, requireAdmin, async (req, res) => {
    const { scheduleDate = '', venue = '', notes = '' } = req.body || {};
    const dt = scheduleDate ? new Date(scheduleDate) : null;
    if (scheduleDate && Number.isNaN(dt.getTime())) {
      return res.status(400).json({ ok:false, message:'Invalid schedule date.' });
    }

    const result = await withDb(async (db) => {
      const col = db.collection('cases');
      const _id = new ObjectId(req.params.id);
      const row = await col.findOne({ _id });
      if (!row) return null;
      if (row.status !== 'Ongoing') {
        return { error: 'Patawag form is only available for ongoing cases.' };
      }

      const now = new Date();
      const me = {
        username: (req.session.user?.username || '').toLowerCase(),
        name: req.session.user?.name || ''
      };

      const entry = {
        _id: new ObjectId(),
        scheduleDate: dt,
        venue: String(venue || '').trim(),
        notes: String(notes || '').trim(),
        createdAt: now,
        createdBy: me
      };

      await col.updateOne(
        { _id },
        {
          $push: { patawagForms: entry },
          $set: { updatedAt: now }
        }
      );

      const updated = await col.findOne({ _id });
      await createCaseNotification(db, updated, {
        type: 'PATAWAG_CREATED',
        message: 'A Patawag form has been generated for this case.'
      });

      return { updated, entry };
    });

    if (!result) return res.status(404).json({ ok:false, message: result?.error || 'Not found' });
    if (result.error) return res.status(400).json({ ok:false, message: result.error });
    res.json({ ok:true, row: result.updated, patawag: result.entry });
  });

  // --- Case notifications API ---
  app.get('/api/case-notifications', requireAuth, async (req, res) => {
    const { limit = '20', unreadOnly = 'false' } = req.query;
    const me = req.session.user;
    if (!me) return res.status(401).json({ ok:false, message:'Not authenticated' });

    const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const data = await withDb(async (db) => {
      const col = db.collection('case_notifications');
      const q = { 'user.username': (me.username || '').toLowerCase() };
      if (unreadOnly === 'true') q.read = { $ne: true };

      const items = await col.find(q).sort({ createdAt: -1 }).limit(l).toArray();
      const unreadCount = await col.countDocuments({ ...q, read: { $ne: true } });
      return { items, unreadCount };
    });

    res.json({ ok:true, items: data.items || [], unreadCount: data.unreadCount || 0 });
  });

  app.post('/api/case-notifications/read-all', requireAuth, async (req, res) => {
    const me = req.session.user;
    if (!me) return res.status(401).json({ ok:false, message:'Not authenticated' });

    await withDb(async (db) => {
      await db.collection('case_notifications').updateMany(
        { 'user.username': (me.username || '').toLowerCase(), read: { $ne: true } },
        { $set: { read: true, readAt: new Date() } }
      );
    });
    res.json({ ok:true });
  });

  // --- Printable views ---
  app.get('/cases/:id/cancellation-letter', requireAuth, async (req, res) => {
    const row = await withDb(async (db) =>
      db.collection('cases').findOne({ _id: new ObjectId(req.params.id) })
    );
    if (!row) {
      return res.status(404).send('Case not found.');
    }

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Cancellation Letter - ${row.caseId}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; }
      h1 { text-align: center; margin-bottom: 24px; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .section { margin-top: 18px; }
      .label { font-weight: bold; }
      @media print {
        button { display: none; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>Case Cancellation Letter</h1>
    <div class="meta">
      <div><span class="label">Case ID:</span> ${row.caseId}</div>
      <div><span class="label">Type of Case:</span> ${row.typeOfCase || ''}</div>
      <div><span class="label">Status:</span> ${row.status || ''}</div>
      <div><span class="label">Cancelled On:</span> ${row.cancelDate ? new Date(row.cancelDate).toLocaleString() : ''}</div>
    </div>
    <div class="section">
      <p>Dear ${row.complainant?.name || 'Sir/Madam'},</p>
      <p>
        This is to formally inform you that Barangay Langkaan II has marked the above-mentioned case
        as <strong>Cancelled</strong>.
      </p>
      ${row.cancellationReason ? `<p><span class="label">Reason:</span> ${row.cancellationReason}</p>` : ''}
      <p>
        Should you have any questions or wish to reopen or clarify this matter, please visit the
        Barangay Hall or contact the Barangay officials.
      </p>
    </div>
    <div class="section" style="margin-top:40px;">
      <p>Respectfully,</p>
      <p><strong>Barangay Langkaan II</strong></p>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  app.get('/cases/:id/patawag-print', requireAuth, async (req, res) => {
    const row = await withDb(async (db) =>
      db.collection('cases').findOne({ _id: new ObjectId(req.params.id) })
    );
    if (!row) {
      return res.status(404).send('Case not found.');
    }
    const lastPatawag = (row.patawagForms || []).slice(-1)[0] || null;

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Patawag Form - ${row.caseId}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; }
      h1 { text-align: center; margin-bottom: 24px; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .section { margin-top: 18px; }
      .label { font-weight: bold; }
      @media print {
        button { display: none; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>BARANGAY PATAWAG FORM</h1>
    <div class="meta">
      <div><span class="label">Case ID:</span> ${row.caseId}</div>
      <div><span class="label">Complainant:</span> ${row.complainant?.name || ''}</div>
      <div><span class="label">Respondent:</span> ${row.respondent?.name || ''}</div>
      <div><span class="label">Schedule:</span> ${
        lastPatawag?.scheduleDate
          ? new Date(lastPatawag.scheduleDate).toLocaleString()
          : 'To be determined'
      }</div>
      <div><span class="label">Venue:</span> ${lastPatawag?.venue || 'Barangay Hall'}</div>
    </div>
    <div class="section">
      <p>
        You are hereby requested to appear at the Barangay Hall of Barangay Langkaan II on the above
        schedule regarding the said case.
      </p>
      ${lastPatawag?.notes ? `<p><span class="label">Notes:</span> ${lastPatawag.notes}</p>` : ''}
    </div>
    <div class="section" style="margin-top:40px;">
      <p>Issued on: ${new Date().toLocaleDateString()}</p>
      <p>Barangay Captain / Lupon Member</p>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  app.get('/cases/:id/full-report', requireAuth, async (req, res) => {
    const row = await withDb(async (db) =>
      db.collection('cases').findOne({ _id: new ObjectId(req.params.id) })
    );
    if (!row) {
      return res.status(404).send('Case not found.');
    }

    const fmt = (d) => d ? new Date(d).toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    }) : '-';
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : '-';
    const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }) : '-';

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Official Case Report - ${row.caseId}</title>
    <style>
      @page {
        size: letter;
        margin: 0.6in 0.8in;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 11pt;
        line-height: 1.6;
        color: #000;
        background: #fff;
        padding: 20px;
        max-width: 8.5in;
        margin: 0 auto;
        letter-spacing: 0.01em;
        position: relative;
      }
      body::before {
        content: '';
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        height: 500px;
        background: radial-gradient(circle, rgba(0,56,168,0.03) 0%, transparent 70%);
        border-radius: 50%;
        z-index: 0;
        pointer-events: none;
      }
      body > * {
        position: relative;
        z-index: 1;
      }
      .print-btn {
        position: fixed;
        top: 25px;
        right: 25px;
        padding: 16px 32px;
        background: linear-gradient(135deg, #0038a8 0%, #002d87 100%);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(0,56,168,0.3);
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .print-btn:hover {
        background: linear-gradient(135deg, #002d87 0%, #001f5c 100%);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,56,168,0.4);
      }
      .letterhead {
        border: 3px solid #0038a8;
        padding: 30px 40px;
        margin-bottom: 30px;
        background: #ffffff;
        position: relative;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .letterhead-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      .seal-left {
        width: 100px;
        height: 100px;
        border: 3px solid #0038a8;
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 8pt;
        color: #0038a8;
        font-weight: bold;
        background: #f8f9fa;
        text-align: center;
        line-height: 1.2;
        padding: 8px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
      }
      .seal-right {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .seal-small {
        width: 60px;
        height: 60px;
        border: 2px solid #0038a8;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 7pt;
        color: #0038a8;
        font-weight: bold;
        background: #f8f9fa;
        text-align: center;
      }
      .letterhead-center {
        text-align: center;
        flex: 1;
        padding: 0 20px;
      }
      .letterhead-title {
        font-size: 14pt;
        font-weight: bold;
        color: #000;
        letter-spacing: 1px;
        margin-bottom: 4px;
        text-transform: uppercase;
        line-height: 1.3;
      }
      .letterhead-subtitle {
        font-size: 16pt;
        color: #0038a8;
        font-weight: bold;
        margin-bottom: 3px;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .letterhead-address {
        font-size: 11pt;
        color: #333;
        font-weight: normal;
        margin-top: 3px;
      }
      .flag-lines {
        display: flex;
        gap: 0;
        margin: 15px 0;
        height: 3px;
      }
      .flag-line-blue {
        flex: 1;
        background: #0038a8;
        height: 3px;
      }
      .flag-line-yellow {
        flex: 1;
        background: #fcd116;
        height: 3px;
      }
      .office-name {
        text-align: center;
        font-size: 12pt;
        font-weight: bold;
        color: #0038a8;
        margin: 10px 0;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .document-title {
        text-align: center;
        font-size: 24pt;
        font-weight: bold;
        color: #000;
        margin: 20px 0 30px;
        text-transform: uppercase;
        letter-spacing: 2px;
        font-family: Arial, sans-serif;
      }
      .form-section {
        margin: 25px 0;
        page-break-inside: avoid;
      }
      .form-item {
        margin-bottom: 18px;
        font-size: 11pt;
      }
      .form-label {
        font-weight: bold;
        color: #000;
        margin-bottom: 5px;
        display: block;
      }
      .form-label-number {
        font-weight: bold;
        color: #0038a8;
        margin-right: 5px;
      }
      .form-value {
        border-bottom: 2px solid #000;
        padding: 5px 0;
        min-height: 20px;
        color: #000;
        font-weight: 500;
        margin-top: 3px;
      }
      .form-value-inline {
        display: inline-block;
        border-bottom: 2px solid #000;
        padding: 5px 10px;
        min-width: 200px;
        color: #000;
        font-weight: 500;
      }
      .form-note {
        font-size: 9pt;
        color: #666;
        font-style: italic;
        margin-top: 3px;
      }
      .checkbox-group {
        display: flex;
        gap: 20px;
        margin-top: 8px;
      }
      .checkbox-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10.5pt;
      }
      .checkbox-item input[type="checkbox"] {
        width: 16px;
        height: 16px;
        border: 2px solid #0038a8;
      }
      .case-header {
        background: #fff;
        border: 2px solid #ddd;
        padding: 25px;
        margin: 30px 0;
        box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      }
      .section {
        margin: 30px 0;
        page-break-inside: avoid;
      }
      .section-title {
        font-size: 13pt;
        font-weight: bold;
        margin-bottom: 15px;
        padding: 10px 15px;
        background: #f0f0f0;
        color: #0038a8;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-left: 5px solid #0038a8;
        border-bottom: 2px solid #0038a8;
      }
      .info-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin: 18px 0;
        font-size: 11pt;
        border: 2px solid #d0d0d0;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      }
      .info-table td {
        padding: 14px 18px;
        border: 1px solid #e0e0e0;
      }
      .info-table td:first-child {
        width: 28%;
        font-weight: 700;
        color: #0038a8;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        text-align: right;
        padding-right: 25px;
        vertical-align: top;
        border-right: 3px solid #0038a8;
        text-transform: uppercase;
        font-size: 10pt;
        letter-spacing: 0.5px;
      }
      .info-table td:last-child {
        color: #1a1a1a;
        font-weight: 500;
        background: #ffffff;
      }
      .description-box {
        background: linear-gradient(135deg, #fafbfc 0%, #ffffff 100%);
        border: 2px solid #d0d0d0;
        border-left: 8px solid #0038a8;
        padding: 25px;
        margin: 18px 0;
        white-space: pre-wrap;
        font-size: 11pt;
        line-height: 2;
        text-align: justify;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        border-radius: 0 4px 4px 0;
      }
      .evidence-section {
        margin: 25px 0;
      }
      .evidence-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin: 18px 0;
        font-size: 10.5pt;
        border: 2px solid #d0d0d0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      }
      .evidence-table thead {
        background: linear-gradient(135deg, #0038a8 0%, #002d87 100%);
        color: #fff;
      }
      .evidence-table th {
        padding: 14px 16px;
        text-align: left;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10pt;
        letter-spacing: 0.8px;
        border-right: 1px solid rgba(255,255,255,0.2);
      }
      .evidence-table th:last-child {
        border-right: none;
      }
      .evidence-table td {
        padding: 14px 16px;
        border: 1px solid #e0e0e0;
        border-top: none;
        vertical-align: middle;
      }
      .evidence-table tbody tr {
        background: #ffffff;
        transition: background 0.2s;
      }
      .evidence-table tbody tr:nth-child(even) {
        background: #f8f9fa;
      }
      .evidence-table tbody tr:hover {
        background: #e8f0f8;
      }
      .evidence-table a {
        color: #0038a8;
        text-decoration: none;
        font-weight: 600;
        border-bottom: 1px dotted #0038a8;
      }
      .evidence-table a:hover {
        color: #002d87;
        border-bottom: 1px solid #002d87;
      }
      .timeline {
        margin: 25px 0;
        border-left: 5px solid #0038a8;
        padding-left: 35px;
        position: relative;
        margin-left: 15px;
      }
      .timeline::before {
        content: '';
        position: absolute;
        left: -10px;
        top: 0;
        width: 18px;
        height: 18px;
        background: #0038a8;
        border-radius: 50%;
        border: 4px solid #fff;
        box-shadow: 0 0 0 3px #0038a8;
      }
      .timeline-item {
        margin-bottom: 25px;
        position: relative;
        padding-left: 25px;
        padding-bottom: 18px;
        border-bottom: 2px dotted #d0d0d0;
      }
      .timeline-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      .timeline-item::before {
        content: '';
        position: absolute;
        left: -42px;
        top: 10px;
        width: 12px;
        height: 12px;
        background: #ce1126;
        border-radius: 50%;
        border: 3px solid #fff;
        box-shadow: 0 0 0 3px #ce1126;
      }
      .timeline-label {
        font-weight: 700;
        color: #0038a8;
        font-size: 12pt;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        font-family: 'Georgia', serif;
      }
      .timeline-value {
        font-size: 10.5pt;
        color: #444;
        font-style: italic;
        margin-left: 12px;
        line-height: 1.6;
      }
      .badge {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 5px;
        font-size: 9.5pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        border: 2px solid;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .badge-Reported {
        background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
        color: #e65100;
        border-color: #ff9800;
      }
      .badge-Ongoing {
        background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
        color: #1565c0;
        border-color: #1976d2;
      }
      .badge-Hearing {
        background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
        color: #2e7d32;
        border-color: #4caf50;
      }
      .badge-Resolved {
        background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
        color: #1b5e20;
        border-color: #2e7d32;
      }
      .badge-Cancelled {
        background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
        color: #b71c1c;
        border-color: #c62828;
      }
      .hearing-box, .patawag-box {
        background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
        border: 2px solid #d0d0d0;
        border-left: 8px solid #0038a8;
        padding: 22px;
        margin-bottom: 18px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        border-radius: 0 4px 4px 0;
      }
      .hearing-box h4, .patawag-box h4 {
        color: #0038a8;
        margin-bottom: 15px;
        font-size: 12.5pt;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 3px solid #0038a8;
        padding-bottom: 8px;
        font-weight: 700;
        font-family: 'Georgia', serif;
      }
      .note-box {
        background: linear-gradient(135deg, #fff3cd 0%, #ffe082 100%);
        border: 3px solid #ffc107;
        border-left: 10px solid #ff9800;
        padding: 22px;
        margin: 30px 0;
        font-size: 11pt;
        box-shadow: 0 3px 10px rgba(0,0,0,0.12);
        border-radius: 0 5px 5px 0;
      }
      .note-box strong {
        color: #e65100;
        display: block;
        margin-bottom: 12px;
        font-size: 12.5pt;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.8px;
      }
      .footer {
        margin-top: 70px;
        padding-top: 30px;
        border-top: 4px double #0038a8;
        text-align: center;
        font-size: 10pt;
        color: #666;
        font-style: italic;
        line-height: 1.8;
      }
      .signature-section {
        margin-top: 60px;
        page-break-inside: avoid;
        display: flex;
        justify-content: space-between;
      }
      .signature-box {
        width: 45%;
      }
      .signature-line {
        border-top: 2px solid #000;
        width: 100%;
        margin: 50px auto 8px;
        padding-top: 5px;
        text-align: center;
        font-size: 11pt;
        font-weight: bold;
      }
      .bcn-section {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 2px solid #ddd;
      }
      .bcn-item {
        margin-bottom: 15px;
      }
      .control-number {
        text-align: right;
        font-size: 9.5pt;
        color: #777;
        margin-bottom: 15px;
        font-style: italic;
        letter-spacing: 0.5px;
        padding: 8px 12px;
        background: #f8f9fa;
        border-left: 4px solid #0038a8;
        display: inline-block;
        float: right;
      }
      @media print {
        .print-btn { display: none; }
        body {
          padding: 0;
          max-width: 100%;
        }
        .section {
          page-break-inside: avoid;
        }
        .letterhead {
          page-break-after: avoid;
        }
        .case-header {
          page-break-inside: avoid;
        }
        .control-number {
          float: none;
          display: block;
        }
      }
    </style>
  </head>
  <body>
    <button class="print-btn" onclick="window.print()">🖨️ Print Report</button>
    
    <div class="control-number">Control No: ${row._id.toString().slice(-8).toUpperCase()}</div>
    <div style="clear: both;"></div>
    
    <div class="letterhead">
      <div class="letterhead-top">
        <div class="seal-left">
          <div style="font-size: 7pt; margin-bottom: 3px;">SAGISAG NG</div>
          <div style="font-size: 7pt; margin-bottom: 3px;">BARANGAY</div>
          <div style="font-size: 6pt; color: #666;">BRGY. LANGKAAN II</div>
          <div style="font-size: 6pt; color: #666;">DASMARIÑAS, CAVITE</div>
        </div>
        <div class="letterhead-center">
          <div class="letterhead-title">Republic of the Philippines</div>
          <div class="letterhead-subtitle">Province of Cavite</div>
          <div class="letterhead-address">City of Dasmariñas</div>
          <div class="letterhead-subtitle" style="font-size: 14pt; margin-top: 5px;">Barangay Langkaan II</div>
        </div>
        <div class="seal-right">
          <div class="seal-small">DILG</div>
          <div class="seal-small" style="font-size: 6pt;">PH<br>FLAG</div>
        </div>
      </div>
      <div class="flag-lines">
        <div class="flag-line-blue"></div>
        <div class="flag-line-yellow"></div>
      </div>
      <div class="office-name">Office of the Punong Barangay</div>
    </div>

    <div class="document-title">Barangay Case Report</div>

    <div class="case-header">
      <div class="form-section">
        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">1.)</span> Barangay Case Number / Numero ng Kaso:
          </div>
          <div class="form-value" style="font-size: 13pt; font-weight: bold; color: #0038a8;">${row.caseId}</div>
          <div class="form-note">(to be filled by Brgy. Staff)</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">2.)</span> Date / Petsa ng pag File:
          </div>
          <div class="form-value">${fmtDate(row.createdAt)}</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">3.)</span> Name / Title ng Case / Kaso:
          </div>
          <div class="form-value">${row.typeOfCase || 'Not Specified'}</div>
          <div style="margin-top: 10px;">
            <span style="font-weight: bold; margin-right: 15px;">Nature ng Kaso:</span>
            <div class="checkbox-group">
              <div class="checkbox-item">
                <input type="checkbox" ${row.typeOfCase && ['Theft', 'Physical Assault', 'Vandalism', 'Harassment'].includes(row.typeOfCase) ? 'checked' : ''} disabled>
                <label>Criminal Case</label>
              </div>
              <div class="checkbox-item">
                <input type="checkbox" ${row.typeOfCase && ['Domestic Dispute', 'Noise Complaint', 'Trespassing'].includes(row.typeOfCase) ? 'checked' : ''} disabled>
                <label>Civil Case</label>
              </div>
            </div>
          </div>
          <div class="form-note">(Refer to Katarungang Pambarangay Handbook)</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">4.)</span> Who / Sino?
          </div>
          <div style="margin-left: 20px; margin-top: 10px;">
            <div class="form-item">
              <div class="form-label">4.1 Complainant(s) / Reklamante:</div>
              <div class="form-value">${row.complainant?.name || 'Not Provided'}</div>
              <div class="form-note">(Pirmahan sa gilid ng iyong pangalan para sa katibayan ng pag file ng reklamo)</div>
            </div>
            <div class="form-item">
              <div class="form-label">4.2 Address / Tirahan:</div>
              <div class="form-value">${row.complainant?.address || 'Not Provided'}</div>
            </div>
            <div class="form-item">
              <div class="form-label">4.3 Contact Number:</div>
              <div class="form-value">${row.complainant?.contact || 'Not Provided'}</div>
            </div>
            <div class="form-item">
              <div class="form-label">4.4 Respondent(s) / Sinisingil:</div>
              <div class="form-value">${row.respondent?.name || 'Not Provided'}</div>
            </div>
            <div class="form-item">
              <div class="form-label">4.5 Address / Tirahan:</div>
              <div class="form-value">${row.respondent?.address || 'Not Provided'}</div>
            </div>
            <div class="form-item">
              <div class="form-label">4.6 Contact Number:</div>
              <div class="form-value">${row.respondent?.contact || 'Not Provided'}</div>
            </div>
          </div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">5.)</span> What / Ano?
          </div>
          <div class="form-value" style="min-height: 120px; padding: 10px; white-space: pre-wrap; text-align: justify;">${(row.description || 'No description provided.').replace(/\n/g, '\n')}</div>
          <div class="form-note">(Isulat ang short na detalye anong mga nangyari tungkol sa iyong reklamo)</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">6.)</span> Where / Saan?
          </div>
          <div class="form-value" style="min-height: 80px; padding: 10px;">${row.placeOfIncident || 'Not Specified'}</div>
          <div class="form-note">(Isulat kung saan particular ang lugar nangyari ang iyong inereklamo insidente)</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">7.)</span> When / Kailan?
          </div>
          <div style="margin-left: 20px; margin-top: 10px;">
            <div class="form-item" style="display: inline-block; width: 48%; margin-right: 4%;">
              <div class="form-label">Date / Petsa:</div>
              <div class="form-value">${fmtDate(row.dateOfIncident)}</div>
            </div>
            <div class="form-item" style="display: inline-block; width: 48%;">
              <div class="form-label">Time / Oras:</div>
              <div class="form-value">${row.dateOfIncident ? new Date(row.dateOfIncident).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Not Specified'}</div>
            </div>
          </div>
          <div class="form-note">(Isulat ang insakto na petsa at ang oras sa pangyayari)</div>
        </div>

        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">8.)</span> Case Status / Estado ng Kaso:
          </div>
          <div class="form-value"><span class="badge badge-${row.status}">${row.status}</span></div>
        </div>

        ${row.priority ? `
        <div class="form-item">
          <div class="form-label">
            <span class="form-label-number">9.)</span> Priority Level / Antas ng Priyoridad:
          </div>
          <div class="form-value"><strong>${row.priority}</strong></div>
        </div>
        ` : ''}
      </div>
    </div>


    ${Array.isArray(row.evidences) && row.evidences.length ? `
    <div class="section">
      <div class="section-title">IV. Evidence Files (${row.evidences.length})</div>
      <table class="evidence-table">
        <thead>
          <tr>
            <th style="width: 60px;">#</th>
            <th>Type</th>
            <th>File Name</th>
            <th style="width: 120px;">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          ${row.evidences.map((ev, idx) => `
            <tr>
              <td><strong>${idx + 1}</strong></td>
              <td>${ev.kind || 'Document'}</td>
              <td><a href="${ev.url}" target="_blank">${ev.filename}</a></td>
              <td>${ev.uploadedAt ? fmtShort(ev.uploadedAt) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${Array.isArray(row.hearings) && row.hearings.length ? `
    <div class="section">
      <div class="section-title">V. Scheduled Hearings (${row.hearings.length})</div>
      ${row.hearings.map((h, idx) => `
        <div class="hearing-box">
          <h4>Hearing #${idx + 1}</h4>
          <table class="info-table">
            <tr>
              <td>Date & Time:</td>
              <td><strong>${fmt(h.dateTime)}</strong></td>
            </tr>
            <tr>
              <td>Venue:</td>
              <td>${h.venue || 'Barangay Hall'}</td>
            </tr>
            ${h.notes ? `
            <tr>
              <td>Notes:</td>
              <td>${h.notes}</td>
            </tr>
            ` : ''}
            ${h.createdBy?.name ? `
            <tr>
              <td>Scheduled By:</td>
              <td>${h.createdBy.name}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${Array.isArray(row.patawagForms) && row.patawagForms.length ? `
    <div class="section">
      <div class="section-title">VI. Patawag Forms (${row.patawagForms.length})</div>
      ${row.patawagForms.map((p, idx) => `
        <div class="patawag-box">
          <h4>Patawag Form #${idx + 1}</h4>
          <table class="info-table">
            <tr>
              <td>Schedule Date:</td>
              <td><strong>${p.scheduleDate ? fmt(p.scheduleDate) : 'Not Scheduled'}</strong></td>
            </tr>
            <tr>
              <td>Venue:</td>
              <td>${p.venue || 'Barangay Hall'}</td>
            </tr>
            ${p.notes ? `
            <tr>
              <td>Notes:</td>
              <td>${p.notes}</td>
            </tr>
            ` : ''}
            ${p.createdAt ? `
            <tr>
              <td>Form Created:</td>
              <td>${fmt(p.createdAt)}</td>
            </tr>
            ` : ''}
            ${p.createdBy?.name ? `
            <tr>
              <td>Created By:</td>
              <td>${p.createdBy.name}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${row.over45Note ? `
    <div class="section">
      <div class="note-box">
        <strong>⚠️ IMPORTANT NOTICE - 45-DAY PERIOD</strong>
        ${row.over45Note}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">VII. Case Timeline</div>
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-label">Case Created</div>
          <div class="timeline-value">${fmt(row.createdAt)}</div>
        </div>
        ${row.ongoingSince ? `
        <div class="timeline-item">
          <div class="timeline-label">Status Changed to Ongoing</div>
          <div class="timeline-value">${fmt(row.ongoingSince)}</div>
        </div>
        ` : ''}
        ${row.resolveDate ? `
        <div class="timeline-item">
          <div class="timeline-label">Case Resolved</div>
          <div class="timeline-value">${fmt(row.resolveDate)}</div>
        </div>
        ` : ''}
        ${row.cancelDate ? `
        <div class="timeline-item">
          <div class="timeline-label">Case Cancelled</div>
          <div class="timeline-value">${fmt(row.cancelDate)}${row.cancellationReason ? '<br><strong>Reason:</strong> ' + row.cancellationReason : ''}</div>
        </div>
        ` : ''}
        <div class="timeline-item">
          <div class="timeline-label">Last Updated</div>
          <div class="timeline-value">${fmt(row.updatedAt)}</div>
        </div>
      </div>
    </div>

    ${Array.isArray(row.statusHistory) && row.statusHistory.length ? `
    <div class="section">
      <div class="section-title">VIII. Status History</div>
      <div class="timeline">
        ${row.statusHistory.map(sh => `
          <div class="timeline-item">
            <div class="timeline-label">${sh.status || 'Status Change'}</div>
            <div class="timeline-value">
              ${fmt(sh.at)}${sh.by?.name ? ' by <strong>' + sh.by.name + '</strong>' : ''}${sh.note ? '<br><em style="color: #555; margin-top: 5px; display: block;">Note: ' + sh.note + '</em>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="bcn-section">
      <div class="form-item">
        <div class="form-label">
          <span class="form-label-number">Barangay Case No. (BCN):</span>
        </div>
        <div class="form-value" style="font-size: 12pt; font-weight: bold; color: #0038a8;">${row.caseId}</div>
        <div class="form-note">(to be filled by Brgy. Staff)</div>
      </div>
    </div>

    <div class="signature-section">
      <div class="signature-box">
        <div class="signature-line">
          <strong>Assisted & Received:</strong>
        </div>
        <div style="text-align: center; font-size: 10pt; color: #666; margin-top: 5px;">
          Barangay Secretary
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-line">
          <strong>Punong Barangay:</strong>
        </div>
        <div style="text-align: center; font-size: 10pt; color: #666; margin-top: 5px;">
          Barangay Captain
        </div>
      </div>
    </div>

    <div class="footer">
      <p style="font-size: 9pt; color: #666; margin-top: 30px; text-align: center;">
        Report generated on ${new Date().toLocaleString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        })} | This is an official document generated by the Barangay Langkaan II Case Management System.
      </p>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
};
