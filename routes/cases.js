// routes/cases.js
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

let multer;
try {
  // optional – used for evidence uploads
  multer = require('multer');
} catch {
  console.warn('[cases] multer not installed — run: npm i multer');
}

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
  const storage = multer.diskStorage({
    destination: (_, __, cb) => {
      cb(null, path.join(process.cwd(), 'uploads'));
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
        res.status(500).json({ ok:false, message:'Failed to create case.' });
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

    const fmt = (d) => d ? new Date(d).toLocaleString() : '-';
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '-';

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Case Report - ${row.caseId}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
      h1 { text-align: center; margin-bottom: 8px; color: #2c3e50; }
      .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 32px; }
      .meta { margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px; }
      .section { margin-top: 24px; page-break-inside: avoid; }
      .section h3 { border-bottom: 2px solid #3498db; padding-bottom: 8px; color: #2c3e50; }
      .kv { display: grid; grid-template-columns: 180px 1fr; gap: 12px; margin-bottom: 8px; }
      .label { font-weight: bold; color: #7f8c8d; }
      .value { color: #2c3e50; }
      .timeline { margin-top: 16px; border-left: 3px solid #3498db; padding-left: 16px; }
      .tl-item { margin-bottom: 12px; }
      .tl-item .m { font-weight: 600; color: #2c3e50; }
      .tl-item .t { font-size: 0.9em; color: #7f8c8d; }
      .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600; }
      .badge-Reported { background: #fff4e5; color: #b9770e; }
      .badge-Ongoing { background: #eaf4ff; color: #1b73c7; }
      .badge-Hearing { background: #e8f5e9; color: #2e7d32; }
      .badge-Resolved { background: #e9f9ef; color: #239b56; }
      .badge-Cancelled { background: #fdecea; color: #c0392b; }
      .evidence-list { list-style: none; padding-left: 0; }
      .evidence-list li { padding: 8px; margin-bottom: 8px; background: #f8f9fa; border-radius: 6px; }
      .note-box { padding: 12px; background: #fff4e5; border-left: 4px solid #f39c12; border-radius: 4px; margin-top: 12px; }
      @media print {
        button { display: none; }
        body { padding: 20px; }
        .section { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; margin-bottom: 20px;">Print Report</button>
    <h1>COMPREHENSIVE CASE REPORT</h1>
    <div class="subtitle">Barangay Langkaan II</div>

    <div class="meta">
      <div class="kv">
        <div class="label">Case ID:</div>
        <div class="value"><strong>${row.caseId}</strong></div>
      </div>
      <div class="kv">
        <div class="label">Status:</div>
        <div class="value"><span class="badge badge-${row.status}">${row.status}</span></div>
      </div>
      <div class="kv">
        <div class="label">Type of Case:</div>
        <div class="value">${row.typeOfCase || '-'}</div>
      </div>
      <div class="kv">
        <div class="label">Priority:</div>
        <div class="value">${row.priority || 'Medium'}</div>
      </div>
      <div class="kv">
        <div class="label">Reported By:</div>
        <div class="value">${row.reportedBy?.name || row.reportedBy?.username || '-'}</div>
      </div>
      <div class="kv">
        <div class="label">Date Reported:</div>
        <div class="value">${fmt(row.createdAt)}</div>
      </div>
      <div class="kv">
        <div class="label">Date of Incident:</div>
        <div class="value">${fmt(row.dateOfIncident)}</div>
      </div>
      <div class="kv">
        <div class="label">Place of Incident:</div>
        <div class="value">${row.placeOfIncident || '-'}</div>
      </div>
      ${row.harassmentType ? `
      <div class="kv">
        <div class="label">Harassment Type:</div>
        <div class="value">${row.harassmentType}</div>
      </div>
      ` : ''}
      ${row.seniorCategory ? `
      <div class="kv">
        <div class="label">Senior-Involved:</div>
        <div class="value">${row.seniorCategory}</div>
      </div>
      ` : ''}
    </div>

    <div class="section">
      <h3>Complainant Information</h3>
      <div class="kv"><div class="label">Name:</div><div class="value">${row.complainant?.name || '-'}</div></div>
      <div class="kv"><div class="label">Address:</div><div class="value">${row.complainant?.address || '-'}</div></div>
      <div class="kv"><div class="label">Contact:</div><div class="value">${row.complainant?.contact || '-'}</div></div>
    </div>

    <div class="section">
      <h3>Respondent Information</h3>
      <div class="kv"><div class="label">Name:</div><div class="value">${row.respondent?.name || '-'}</div></div>
      <div class="kv"><div class="label">Address:</div><div class="value">${row.respondent?.address || '-'}</div></div>
      <div class="kv"><div class="label">Contact:</div><div class="value">${row.respondent?.contact || '-'}</div></div>
    </div>

    <div class="section">
      <h3>Case Description</h3>
      <p style="white-space: pre-wrap; background: #f8f9fa; padding: 16px; border-radius: 6px;">${row.description || '-'}</p>
    </div>

    ${Array.isArray(row.evidences) && row.evidences.length ? `
    <div class="section">
      <h3>Evidence Files (${row.evidences.length})</h3>
      <ul class="evidence-list">
        ${row.evidences.map(ev => `
          <li>
            <strong>${ev.kind || 'File'}:</strong> 
            <a href="${ev.url}" target="_blank">${ev.filename}</a>
            ${ev.uploadedAt ? ` (Uploaded: ${fmtDate(ev.uploadedAt)})` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${Array.isArray(row.hearings) && row.hearings.length ? `
    <div class="section">
      <h3>Hearings (${row.hearings.length})</h3>
      ${row.hearings.map((h, idx) => `
        <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 6px;">
          <div class="kv"><div class="label">Hearing #${idx + 1}:</div><div class="value">${fmt(h.dateTime)}</div></div>
          <div class="kv"><div class="label">Venue:</div><div class="value">${h.venue || 'Barangay Hall'}</div></div>
          ${h.notes ? `<div class="kv"><div class="label">Notes:</div><div class="value">${h.notes}</div></div>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${Array.isArray(row.patawagForms) && row.patawagForms.length ? `
    <div class="section">
      <h3>Patawag Forms (${row.patawagForms.length})</h3>
      ${row.patawagForms.map((p, idx) => `
        <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 6px;">
          <div class="kv"><div class="label">Patawag #${idx + 1}:</div><div class="value">${p.scheduleDate ? fmt(p.scheduleDate) : 'No schedule'}</div></div>
          <div class="kv"><div class="label">Venue:</div><div class="value">${p.venue || 'Barangay Hall'}</div></div>
          ${p.notes ? `<div class="kv"><div class="label">Notes:</div><div class="value">${p.notes}</div></div>` : ''}
          ${p.createdAt ? `<div class="kv"><div class="label">Created:</div><div class="value">${fmt(p.createdAt)}</div></div>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${row.over45Note ? `
    <div class="section">
      <div class="note-box">
        <strong>⚠️ 45-Day Notice:</strong><br>
        ${row.over45Note}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h3>Case Timeline</h3>
      <div class="timeline">
        <div class="tl-item">
          <div class="m">Case Created</div>
          <div class="t">${fmt(row.createdAt)}</div>
        </div>
        ${row.ongoingSince ? `
        <div class="tl-item">
          <div class="m">Status Changed to Ongoing</div>
          <div class="t">${fmt(row.ongoingSince)}</div>
        </div>
        ` : ''}
        ${row.resolveDate ? `
        <div class="tl-item">
          <div class="m">Case Resolved</div>
          <div class="t">${fmt(row.resolveDate)}</div>
        </div>
        ` : ''}
        ${row.cancelDate ? `
        <div class="tl-item">
          <div class="m">Case Cancelled</div>
          <div class="t">${fmt(row.cancelDate)}</div>
          ${row.cancellationReason ? `<div class="t" style="margin-top: 4px;">Reason: ${row.cancellationReason}</div>` : ''}
        </div>
        ` : ''}
        <div class="tl-item">
          <div class="m">Last Updated</div>
          <div class="t">${fmt(row.updatedAt)}</div>
        </div>
      </div>
    </div>

    ${Array.isArray(row.statusHistory) && row.statusHistory.length ? `
    <div class="section">
      <h3>Status History</h3>
      <div class="timeline">
        ${row.statusHistory.map(sh => `
          <div class="tl-item">
            <div class="m">${sh.status || 'Status Change'}</div>
            <div class="t">
              ${fmt(sh.at)} 
              ${sh.by?.name ? ' by ' + sh.by.name : ''}
              ${sh.note ? '<br><em>' + sh.note + '</em>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section" style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ecf0f1;">
      <p style="text-align: center; color: #7f8c8d; font-size: 0.9em;">
        Report generated on ${new Date().toLocaleString()}<br>
        Barangay Langkaan II Case Management System
      </p>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
};
