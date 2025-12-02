// routes/health.js
// Health & Patient Records module

const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = function healthRoutes(withDb, requireAuth, requireAdmin) {
  const router = express.Router();

  // ---------- collection + index bootstrap ----------
  async function ensureHealthCollections(db) {
    const names = (await db.listCollections().toArray()).map(c => c.name);

    const ensure = async (name, indexes = []) => {
      if (!names.includes(name)) {
        await db.createCollection(name);
      }
      const col = db.collection(name);
      for (const idx of indexes) {
        try {
          await col.createIndex(idx.keys, idx.options || {});
        } catch (e) {
          console.warn('[health] index warning for', name, idx, e.message);
        }
      }
    };

    await ensure('health_patient_data', [
      { keys: { dateTime: -1 }, options: { name: 'by_dateTime' } },
      { keys: { status: 1, dateTime: -1 }, options: { name: 'by_status_date' } }
    ]);
    await ensure('health_family_planning', [
      { keys: { dateOfBirth: -1 }, options: { name: 'by_dob' } }
    ]);
    await ensure('health_post_partum', [
      { keys: { deliveryDateTime: -1 }, options: { name: 'by_delivery' } }
    ]);
    await ensure('health_child_immunization', [
      { keys: { birthday: -1 }, options: { name: 'by_bday' } }
    ]);
    await ensure('health_individual_treatment', [
      { keys: { consultationDate: -1 }, options: { name: 'by_consult' } },
      { keys: { status: 1, consultationDate: -1 }, options: { name: 'by_status_consult' } }
    ]);
    await ensure('health_patient_records', [
      { keys: { surname: 1, givenName: 1 }, options: { name: 'by_name' } },
      { keys: { barangay: 1 }, options: { name: 'by_barangay' } }
    ]);
    await ensure('health_pregnancy_tracking', [
      { keys: { lmp: -1 }, options: { name: 'by_lmp' } },
      { keys: { edd: -1 }, options: { name: 'by_edd' } }
    ]);
    await ensure('health_prenatal_visits', [
      { keys: { visitDate: -1 }, options: { name: 'by_visit' } },
      { keys: { type: 1, visitDate: -1 }, options: { name: 'by_type_visit' } }
    ]);
    await ensure('health_medicines', [
      { keys: { name: 1 }, options: { name: 'by_name' } },
      { keys: { category: 1 }, options: { name: 'by_category' } }
    ]);
    await ensure('health_midwives', [
      { keys: { name: 1 }, options: { name: 'by_name' } }
    ]);
    await ensure('health_schedules', [
      { keys: { type: 1, preferredDate: 1 }, options: { name: 'by_type_date' } },
      { keys: { residentUsername: 1 }, options: { name: 'by_resident' } },
      { keys: { status: 1, preferredDate: 1 }, options: { name: 'by_status_date' } }
    ]);
  }

  async function withHealth(fn) {
    return withDb(async (db) => {
      await ensureHealthCollections(db);
      return fn(db);
    });
  }

  // ---------- helpers ----------
  function parsePaging(req) {
    const {
      page = '1',
      limit = '10',
      status = '',
      q = '',
      from = '',
      to = '',
      sort = 'desc',
      mine = '',
      userId = ''
    } = req.query;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return {
      page: p,
      limit: l,
      status: String(status || ''),
      q: String(q || ''),
      from: String(from || ''),
      to: String(to || ''),
      sort: sort === 'asc' ? 'asc' : 'desc',
      mine: String(mine || ''),
      userId: String(userId || '')
    };
  }

  function buildDateRangeQuery(field, from, to) {
    if (!from && !to) return {};
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      range.$lte = t;
    }
    return { [field]: range };
  }

  function buildSearchQuery(fields, q) {
    if (!q || !q.trim() || !fields?.length) return {};
    const rx = new RegExp(q.trim(), 'i');
    return {
      $or: fields.map(f => ({ [f]: rx }))
    };
  }

  function csvEscape(v) {
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // ---------- summary ----------
  router.get('/api/health/summary', requireAuth, async (req, res) => {
    try {
      const { mine = '' } = req.query;
      const me = req.session.user || {};
      const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;
      // For admins, default to showing all records unless explicitly filtered
      // For non-admins, default to showing only their records
      const mineOnly = mine === 'true' || (!isAdmin && mine !== 'false');
      
      console.log('[health] summary request:', { 
        isAdmin, 
        mine, 
        mineOnly, 
        username: me.username,
        role: me.role 
      });

      const summary = await withHealth(async (db) => {
        const out = {
          Total: 0,
          Active: 0,
          Scheduled: 0,
          Completed: 0,
          Pending: 0,
          Overdue: 0
        };

        // Build filter for user-specific records if needed
        const userFilter = {};
        if (mineOnly && me.username) {
          userFilter['createdBy.username'] = me.username.toLowerCase();
        }

        // Build filters once for reuse
        const patientRecordsCol = db.collection('health_patient_records');
        const patientRecordsMatch = mineOnly && me.username ? { 'createdBy.username': me.username.toLowerCase() } : {};
        
        const patientDataCol = db.collection('health_patient_data');
        let patientDataMatch = {};
        if (mineOnly && me.username) {
          const usernameLower = me.username.toLowerCase();
          const userName = (me.name || '').toLowerCase();
          patientDataMatch = {
            $or: [
              { 'createdBy.username': usernameLower },
              { residentUsername: usernameLower },
              { patientUsername: usernameLower },
              ...(userName ? [{ coordinator: { $regex: userName, $options: 'i' } }] : [])
            ]
          };
        }

        const schedulesCol = db.collection('health_schedules');
        const scheduleMatch = mineOnly && me.username ? { residentUsername: me.username.toLowerCase() } : {};

        // Run all initial queries in parallel for better performance
        const [patientRecordsCount, patientStatusCounts, totalSchedules, scheduleStatusCounts] = await Promise.all([
          // Count Total Patients from health_patient_records collection
          patientRecordsCol.countDocuments(patientRecordsMatch),
          
          // Count by status from patient_data
          patientDataCol.aggregate([
            { $match: patientDataMatch },
            { $group: { _id: '$status', n: { $sum: 1 } } }
          ]).toArray(),
          
          // Count total schedules
          schedulesCol.countDocuments(scheduleMatch),
          
          // Count schedules by status
          schedulesCol.aggregate([
            { $match: scheduleMatch },
            { $group: { _id: '$status', n: { $sum: 1 } } }
          ]).toArray()
        ]);

        out.Total = patientRecordsCount;
        out.Total += totalSchedules; // Add schedules to total count
        
        // Debug logging to help troubleshoot
        if (patientRecordsCount === 0) {
          const totalInCollection = await patientRecordsCol.countDocuments({});
          console.log('[health] summary - Total Patients debug:', {
            isAdmin,
            mineOnly,
            username: me.username,
            filter: patientRecordsMatch,
            filteredCount: patientRecordsCount,
            totalInCollection: totalInCollection,
            message: totalInCollection > 0 ? 'Records exist but filtered out' : 'No records in collection'
          });
        }

        // Process patient status counts
        patientStatusCounts.forEach(r => {
          const k = r._id || 'Pending';
          if (k === 'Active' && Object.prototype.hasOwnProperty.call(out, 'Active')) {
            out.Active += r.n;
          }
          if (k === 'Scheduled' && Object.prototype.hasOwnProperty.call(out, 'Scheduled')) {
            out.Scheduled += r.n;
          }
          if (k === 'Completed' && Object.prototype.hasOwnProperty.call(out, 'Completed')) {
            out.Completed += r.n;
          }
          if (k === 'Pending' && Object.prototype.hasOwnProperty.call(out, 'Pending')) {
            out.Pending += r.n;
          }
          if (k === 'Overdue' && Object.prototype.hasOwnProperty.call(out, 'Overdue')) {
            out.Overdue += r.n;
          }
        });

        // Process schedule status counts
        scheduleStatusCounts.forEach(r => {
          const k = r._id || 'Pending';
          if (k === 'Scheduled' && Object.prototype.hasOwnProperty.call(out, 'Scheduled')) {
            out.Scheduled += r.n;
          }
          if (k === 'Completed' && Object.prototype.hasOwnProperty.call(out, 'Completed')) {
            out.Completed += r.n;
          }
          if (k === 'Pending' && Object.prototype.hasOwnProperty.call(out, 'Pending')) {
            out.Pending += r.n;
          }
        });

        // Build filter for other health records (same logic as patientDataMatch)
        let otherRecordsMatch = {};
        if (mineOnly && me.username) {
          const usernameLower = me.username.toLowerCase();
          const userName = (me.name || '').toLowerCase();
          otherRecordsMatch = {
            $or: [
              { 'createdBy.username': usernameLower },
              { residentUsername: usernameLower },
              { patientUsername: usernameLower },
              ...(userName ? [
                { lastName: { $regex: userName, $options: 'i' } },
                { givenName: { $regex: userName, $options: 'i' } },
                { patientName: { $regex: userName, $options: 'i' } },
                { name: { $regex: userName, $options: 'i' } }
              ] : [])
            ]
          };
        }
        
        // Count active programs (from various collections)
        const activePrograms = await Promise.all([
          db.collection('health_family_planning').countDocuments({ ...otherRecordsMatch, status: 'Active' }),
          db.collection('health_child_immunization').countDocuments({ ...otherRecordsMatch, status: 'Active' }),
          db.collection('health_individual_treatment').countDocuments({ ...otherRecordsMatch, status: 'Active' })
        ]);
        out.Active = activePrograms.reduce((sum, count) => sum + count, out.Active);
        
        // Also count other health records (family planning, child immunization, individual treatment, etc.) in Total
        const otherRecordsCount = await Promise.all([
          db.collection('health_family_planning').countDocuments(otherRecordsMatch),
          db.collection('health_child_immunization').countDocuments(otherRecordsMatch),
          db.collection('health_individual_treatment').countDocuments(otherRecordsMatch),
          db.collection('health_post_partum').countDocuments(otherRecordsMatch),
          db.collection('health_pregnancy_tracking').countDocuments(otherRecordsMatch),
          db.collection('health_prenatal_visits').countDocuments(otherRecordsMatch)
        ]);
        out.Total += otherRecordsCount.reduce((sum, count) => sum + count, 0);

        return out;
      });

      res.json({ ok: true, summary });
    } catch (e) {
      console.error('[health] summary error', e);
      res.json({ ok: false, summary: { Total: 0, Active: 0, Scheduled: 0, Completed: 0, Pending: 0, Overdue: 0 } });
    }
  });

  // ---------- generic list handler ----------
  async function listCollection(req, res, cfg) {
    const {
      collection,
      dateField,
      searchableFields = [],
      defaultSort = { createdAt: -1 },
      extraFilter = () => ({})
    } = cfg;

    const {
      page, limit, status, q, from, to, sort, mine
    } = parsePaging(req);

    const me = req.session.user || {};
    const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;

    const query = {
      ...extraFilter(req)
    };

    if (status) query.status = status;
    if (dateField && (from || to)) {
      // Only apply date range if dates are provided
      Object.assign(query, buildDateRangeQuery(dateField, from, to));
    }
    const searchQuery = buildSearchQuery(searchableFields, q);
    if (Object.keys(searchQuery).length > 0) {
      Object.assign(query, searchQuery);
    }

    // For non-admins, filter to their own records only
    // Check both createdBy.username (for records they created) and residentUsername (for records created by admins for them)
    if (!isAdmin && mine !== 'false') {
      if (me.username) {
        const usernameLower = me.username.toLowerCase();
        // Match records created by the user OR records linked to the user's username
        query.$or = [
          { 'createdBy.username': usernameLower },
          { residentUsername: usernameLower },
          { patientUsername: usernameLower }
        ];
      }
    }
    // Admins see all records - no additional filter needed

    const exportCsv = String(req.query.exportCsv || '').toLowerCase() === 'true';

    const data = await withHealth(async (db) => {
      const col = db.collection(collection);
      // Build sort spec - handle missing dateField gracefully
      let sortSpec = defaultSort;
      if (dateField) {
        // Sort by dateField if it exists, fallback to createdAt
        sortSpec = { 
          [dateField]: sort === 'asc' ? 1 : -1,
          createdAt: sort === 'asc' ? 1 : -1  // Secondary sort for records without dateField
        };
      }

      const cursor = col.find(query).sort(sortSpec);

      if (exportCsv) {
        const rows = await cursor.toArray();
        return { rows };
      }

      const total = await col.countDocuments(query);
      const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
      return { rows, total };
    });

    if (exportCsv) {
      const headers = cfg.csvHeaders || [];
      const toRow = cfg.csvMap || ((r) => headers.map(h => r[h] ?? ''));

      const lines = [];
      if (headers.length) {
        lines.push(headers.join(','));
      }
      (data.rows || []).forEach(r => {
        const cols = toRow(r).map(csvEscape);
        lines.push(cols.join(','));
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="health-export.csv"');
      return res.send(lines.join('\n'));
    }

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
    return res.json({
      ok: true,
      rows: data.rows || [],
      total: data.total || 0,
      page,
      limit,
      totalPages
    });
  }

  // ---------- PATIENT DATA (program-level events) ----------
  router.get('/api/health/patient-data', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_patient_data',
      dateField: 'dateTime',
      searchableFields: ['coordinator', 'program', 'type', 'location'],
      csvHeaders: ['coordinator', 'program', 'type', 'location', 'dateTime', 'status'],
      csvMap: (r) => [
        r.coordinator,
        r.program,
        r.type,
        r.location,
        r.dateTime ? new Date(r.dateTime).toISOString() : '',
        r.status
      ]
    });
  });

  router.post('/api/health/patient-data', requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        coordinator = '',
        program = '',
        type = '',
        location = '',
        datetime = '',
        status = 'Scheduled',
        residentUsername = ''
      } = req.body || {};

      if (!coordinator || !program || !type || !location || !datetime) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const dt = new Date(datetime);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid date/time.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        coordinator: String(coordinator).trim(),
        program: String(program).trim(),
        type: String(type).trim(),
        location: String(location).trim(),
        dateTime: dt,
        createdAt: now,
        status: String(status || 'Scheduled'),
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_patient_data').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] patient-data create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- FAMILY PLANNING ----------
  router.get('/api/health/family-planning', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_family_planning',
      dateField: 'dateOfBirth',
      searchableFields: ['lastName', 'givenName', 'address', 'clientType', 'fpMethod'],
      csvHeaders: ['lastName', 'givenName', 'age', 'address', 'clientType', 'fpMethod', 'dateOfBirth'],
      csvMap: (r) => [
        r.lastName,
        r.givenName,
        r.age,
        r.address,
        r.clientType,
        r.fpMethod,
        r.dateOfBirth ? new Date(r.dateOfBirth).toISOString() : ''
      ]
    });
  });

  router.post('/api/health/family-planning', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        lastName = '',
        givenName = '',
        middleInitial = '',
        dateOfBirth = '',
        age = '',
        address = '',
        contactNumber = '',
        clientType = '',
        fpMethod = '',
        residentUsername = ''
      } = b;

      if (!lastName || !givenName || !dateOfBirth || !age || !address || !clientType) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const dob = new Date(dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid date of birth.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        lastName: String(lastName).trim(),
        givenName: String(givenName).trim(),
        middleInitial: String(middleInitial || '').trim(),
        dateOfBirth: dob,
        age: Number(age) || null,
        address: String(address).trim(),
        contactNumber: String(contactNumber || '').trim(),
        clientType: String(clientType).trim(),
        fpMethod: String(fpMethod || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_family_planning').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] family-planning create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- POST PARTUM ----------
  router.get('/api/health/post-partum', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_post_partum',
      dateField: 'deliveryDateTime',
      searchableFields: ['motherName', 'address', 'placeOfDelivery', 'gender'],
      csvHeaders: ['motherName', 'address', 'ageOfMother', 'deliveryDateTime', 'placeOfDelivery', 'gender', 'tetanusStatus', 'details30Min'],
      csvMap: (r) => [
        r.motherName,
        r.address,
        r.ageOfMother,
        r.deliveryDateTime ? new Date(r.deliveryDateTime).toISOString() : '',
        r.placeOfDelivery,
        r.gender,
        r.tetanusStatus,
        r.details30Min || ''
      ]
    });
  });

  router.post('/api/health/post-partum', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        motherName = '',
        address = '',
        ageOfMother = '',
        birthDate = '',
        gravida = '',
        para = '',
        placeOfDelivery = '',
        deliveryDateTime = '',
        gender = '',
        weight = '',
        tetanusStatus = '',
        details30Min = '',
        residentUsername = ''
      } = b;

      if (!motherName || !address || !ageOfMother || !birthDate || !gravida || !placeOfDelivery || !deliveryDateTime || !gender || !weight) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      if (gender === 'M') {
        return res.status(400).json({ ok: false, message: 'Post-partum tracking is only applicable for female patients.' });
      }

      const dob = new Date(birthDate);
      const dt = new Date(deliveryDateTime);
      if (Number.isNaN(dob.getTime()) || Number.isNaN(dt.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid birth or delivery date.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        motherName: String(motherName).trim(),
        address: String(address).trim(),
        ageOfMother: Number(ageOfMother) || null,
        birthDate: dob,
        gravida: Number(gravida) || null,
        para: Number(para) || 0,
        placeOfDelivery: String(placeOfDelivery).trim(),
        deliveryDateTime: dt,
        gender: String(gender),
        weight: Number(weight),
        tetanusStatus: String(tetanusStatus || '').trim(),
        details30Min: String(details30Min || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_post_partum').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] post-partum create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- CHILD IMMUNIZATION ----------
  router.get('/api/health/child-immunization', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_child_immunization',
      dateField: 'birthday',
      searchableFields: ['childName', 'address', 'motherName', 'fatherName'],
      csvHeaders: ['childName', 'birthday', 'age', 'bcgDate', 'hepBBirthDate', 'pentavalent1Date', 'opv1Date', 'mmr1Date'],
      csvMap: (r) => [
        r.childName,
        r.birthday ? new Date(r.birthday).toISOString() : '',
        r.age,
        r.bcgDate ? new Date(r.bcgDate).toISOString() : '',
        r.hepBBirthDate ? new Date(r.hepBBirthDate).toISOString() : '',
        r.pentavalent1Date ? new Date(r.pentavalent1Date).toISOString() : '',
        r.opv1Date ? new Date(r.opv1Date).toISOString() : '',
        r.mmr1Date ? new Date(r.mmr1Date).toISOString() : ''
      ]
    });
  });

  router.post('/api/health/child-immunization', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        childName = '',
        birthday = '',
        age = '',
        gender = '',
        address = '',
        motherName = '',
        fatherName = '',
        bcgDate = '',
        hepBBirthDate = '',
        pentavalent1Date = '',
        opv1Date = '',
        mmr1Date = '',
        residentUsername = ''
      } = b;

      if (!childName || !birthday || !gender || !address) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const bday = new Date(birthday);
      if (Number.isNaN(bday.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid birthday.' });
      }

      const parseOptDate = (v) => (v ? new Date(v) : null);

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        childName: String(childName).trim(),
        birthday: bday,
        age: Number(age) || null,
        gender: String(gender),
        address: String(address).trim(),
        motherName: String(motherName || '').trim(),
        fatherName: String(fatherName || '').trim(),
        bcgDate: bcgDate ? parseOptDate(bcgDate) : null,
        hepBBirthDate: hepBBirthDate ? parseOptDate(hepBBirthDate) : null,
        pentavalent1Date: pentavalent1Date ? parseOptDate(pentavalent1Date) : null,
        opv1Date: opv1Date ? parseOptDate(opv1Date) : null,
        mmr1Date: mmr1Date ? parseOptDate(mmr1Date) : null,
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_child_immunization').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] child-immunization create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- INDIVIDUAL TREATMENT ----------
  router.get('/api/health/individual-treatment', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_individual_treatment',
      dateField: 'consultationDate',
      searchableFields: ['patientName', 'address', 'historyOfIllness', 'assessment'],
      csvHeaders: ['patientName', 'consultationDate', 'age', 'address', 'historyOfIllness', 'status'],
      csvMap: (r) => [
        r.patientName,
        r.consultationDate ? new Date(r.consultationDate).toISOString() : '',
        r.age,
        r.address,
        r.historyOfIllness,
        r.status
      ]
    });
  });

  router.post('/api/health/individual-treatment', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        patientName = '',
        consultationDate = '',
        age = '',
        birthday = '',
        address = '',
        sex = '',
        philhealth = '',
        bloodPressure = '',
        temperature = '',
        historyOfIllness = '',
        assessment = '',
        treatmentPlan = '',
        status = 'Active',
        residentUsername = ''
      } = b;

      if (!patientName || !consultationDate || !age || !birthday || !address || !sex || !historyOfIllness || !assessment || !treatmentPlan) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const cDate = new Date(consultationDate);
      const bday = new Date(birthday);
      if (Number.isNaN(cDate.getTime()) || Number.isNaN(bday.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid dates.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        patientName: String(patientName).trim(),
        consultationDate: cDate,
        birthday: bday,
        age: Number(age) || null,
        address: String(address).trim(),
        sex: String(sex),
        philhealth: String(philhealth || '').trim(),
        bloodPressure: String(bloodPressure || '').trim(),
        temperature: temperature ? Number(temperature) : null,
        historyOfIllness: String(historyOfIllness).trim(),
        assessment: String(assessment).trim(),
        treatmentPlan: String(treatmentPlan).trim(),
        status: String(status || 'Active'),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_individual_treatment').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] individual-treatment create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- PATIENT DATA RECORD (master patient) ----------
  router.get('/api/health/patient-records', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_patient_records',
      dateField: 'birthDate',
      searchableFields: ['surname', 'givenName', 'middleName', 'barangay', 'contactNumber'],
      csvHeaders: ['surname', 'givenName', 'middleName', 'age', 'gender', 'barangay', 'contactNumber', 'philhealth', 'civilStatus', 'height', 'weight', 'bloodPressure', 'cvdStatus', 'ncdStatus'],
      csvMap: (r) => [
        r.surname,
        r.givenName,
        r.middleName,
        r.age,
        r.gender,
        r.barangay,
        r.contactNumber,
        r.philhealth,
        r.civilStatus,
        r.height,
        r.weight,
        r.bloodPressure,
        r.cvdStatus || '',
        r.ncdStatus || ''
      ]
    });
  });

  router.post('/api/health/patient-records', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        surname = '',
        givenName = '',
        middleName = '',
        age = '',
        birthDate = '',
        gender = '',
        barangay = '',
        contactNumber = '',
        philhealth = '',
        civilStatus = '',
        height = '',
        weight = '',
        bloodPressure = '',
        status = 'Active',
        cvdStatus = '',
        ncdStatus = '',
        chronicConditions = '',
        residentUsername = ''
      } = b;

      if (!surname || !givenName || !age || !birthDate || !gender || !barangay) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const bday = new Date(birthDate);
      if (Number.isNaN(bday.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid birth date.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        surname: String(surname).trim(),
        givenName: String(givenName).trim(),
        middleName: String(middleName || '').trim(),
        age: Number(age) || null,
        birthDate: bday,
        gender: String(gender),
        barangay: String(barangay).trim(),
        contactNumber: String(contactNumber || '').trim(),
        philhealth: String(philhealth || '').trim(),
        civilStatus: String(civilStatus || '').trim(),
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
        bloodPressure: String(bloodPressure || '').trim(),
        status: String(status || 'Active'),
        cvdStatus: String(cvdStatus || '').trim(), // cardiovascular disease risk/notes
        ncdStatus: String(ncdStatus || '').trim(), // non-communicable disease notes
        chronicConditions: String(chronicConditions || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_patient_records').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] patient-records create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- PREGNANCY TRACKING ----------
  router.get('/api/health/pregnancy-tracking', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_pregnancy_tracking',
      dateField: 'lmp',
      searchableFields: ['name', 'completeAddress', 'healthFacility', 'riskLevel'],
      csvHeaders: ['name', 'completeAddress', 'age', 'lmp', 'edd', 'prenatalConsultation', 'healthFacility', 'contactNumber', 'gravida', 'para', 'riskLevel'],
      csvMap: (r) => [
        r.name,
        r.completeAddress,
        r.age,
        r.lmp ? new Date(r.lmp).toISOString() : '',
        r.edd ? new Date(r.edd).toISOString() : '',
        r.prenatalConsultation,
        r.healthFacility,
        r.contactNumber,
        r.gravida,
        r.para,
        r.riskLevel
      ]
    });
  });

  router.post('/api/health/pregnancy-tracking', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        name = '',
        age = '',
        completeAddress = '',
        lmp = '',
        edd = '',
        prenatalConsultation = '',
        healthFacility = '',
        contactNumber = '',
        gravida = '',
        para = '',
        riskLevel = '',
        residentUsername = ''
      } = b;

      if (!name || !age || !completeAddress || !lmp || !edd || !healthFacility) {
        return res.status(400).json({ ok: false, message: 'Please fill all required fields.' });
      }

      const lmpDate = new Date(lmp);
      const eddDate = new Date(edd);
      if (Number.isNaN(lmpDate.getTime()) || Number.isNaN(eddDate.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid pregnancy dates.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        name: String(name).trim(),
        age: Number(age) || null,
        completeAddress: String(completeAddress).trim(),
        lmp: lmpDate,
        edd: eddDate,
        prenatalConsultation: String(prenatalConsultation || '').trim(),
        healthFacility: String(healthFacility).trim(),
        contactNumber: String(contactNumber || '').trim(),
        gravida: gravida ? Number(gravida) : null,
        para: para ? Number(para) : null,
        riskLevel: String(riskLevel || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_pregnancy_tracking').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] pregnancy-tracking create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save record.' });
    }
  });

  // ---------- PRENATAL VISITS (new form) ----------
  router.get('/api/health/prenatal', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_prenatal_visits',
      dateField: 'visitDate',
      searchableFields: ['patientName', 'address', 'trimester', 'midwifeName'],
      csvHeaders: ['patientName', 'age', 'address', 'visitDate', 'trimester', 'bloodPressure', 'weight', 'fundicHeight', 'fetalHeartTone', 'remarks'],
      csvMap: (r) => [
        r.patientName,
        r.age,
        r.address,
        r.visitDate ? new Date(r.visitDate).toISOString() : '',
        r.trimester,
        r.bloodPressure,
        r.weight,
        r.fundicHeight,
        r.fetalHeartTone,
        r.remarks
      ]
    });
  });

  router.post('/api/health/prenatal', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        patientName = '',
        age = '',
        address = '',
        visitDate = '',
        trimester = '',
        bloodPressure = '',
        weight = '',
        fundicHeight = '',
        fetalHeartTone = '',
        midwifeId = '',
        midwifeName = '',
        remarks = '',
        residentUsername = ''
      } = b;

      if (!patientName || !age || !address || !visitDate || !trimester) {
        return res.status(400).json({ ok: false, message: 'Please fill all required prenatal fields.' });
      }

      const vDate = new Date(visitDate);
      if (Number.isNaN(vDate.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid visit date.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        patientName: String(patientName).trim(),
        age: Number(age) || null,
        address: String(address).trim(),
        visitDate: vDate,
        trimester: String(trimester).trim(),
        bloodPressure: String(bloodPressure || '').trim(),
        weight: weight ? Number(weight) : null,
        fundicHeight: String(fundicHeight || '').trim(),
        fetalHeartTone: String(fetalHeartTone || '').trim(),
        midwifeId: midwifeId ? new ObjectId(midwifeId) : null,
        midwifeName: String(midwifeName || '').trim(),
        remarks: String(remarks || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      // Link record to resident if username provided
      if (residentUsername && residentUsername.trim()) {
        doc.residentUsername = String(residentUsername).trim().toLowerCase();
      }

      await withHealth(async (db) => {
        await db.collection('health_prenatal_visits').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] prenatal create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save prenatal record.' });
    }
  });

  // ---------- MEDICINES (inventory with categories + stock limits) ----------
  router.get('/api/health/medicines', requireAuth, requireAdmin, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_medicines',
      dateField: 'createdAt',
      searchableFields: ['name', 'category'],
      csvHeaders: ['name', 'category', 'stock', 'minStock', 'maxStock', 'unit', 'status'],
      csvMap: (r) => [
        r.name,
        r.category,
        r.stock,
        r.minStock,
        r.maxStock,
        r.unit,
        r.status
      ]
    });
  });

  router.post('/api/health/medicines', requireAuth, requireAdmin, async (req, res) => {
    try {
      const {
        name = '',
        category = '',
        stock = '',
        minStock = '',
        maxStock = '',
        unit = 'tablet'
      } = req.body || {};

      if (!name || !category) {
        return res.status(400).json({ ok: false, message: 'Name and category are required.' });
      }

      const s = Number(stock) || 0;
      const minS = Number(minStock) || 0;
      const maxS = Number(maxStock) || 0;

      let status = 'OK';
      if (s <= minS && minS > 0) status = 'Low';
      if (maxS > 0 && s > maxS) status = 'Overstock';

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        name: String(name).trim(),
        category: String(category).trim(),
        stock: s,
        minStock: minS,
        maxStock: maxS,
        unit: String(unit || 'tablet').trim(),
        status,
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withHealth(async (db) => {
        await db.collection('health_medicines').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] medicines create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save medicine record.' });
    }
  });

  // ---------- MIDWIVES / KUMADRONAS ----------
  router.get('/api/health/midwives', requireAuth, async (req, res) => {
    await listCollection(req, res, {
      collection: 'health_midwives',
      dateField: 'createdAt',
      searchableFields: ['name', 'contactNumber', 'details'],
      csvHeaders: ['name', 'contactNumber', 'details'],
      csvMap: (r) => [
        r.name,
        r.contactNumber,
        r.details
      ]
    });
  });

  router.post('/api/health/midwives', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name = '', contactNumber = '', details = '' } = req.body || {};
      if (!name || !contactNumber) {
        return res.status(400).json({ ok: false, message: 'Name and contact number are required.' });
      }

      const me = req.session.user || {};
      const now = new Date();

      const doc = {
        name: String(name).trim(),
        contactNumber: String(contactNumber).trim(),
        details: String(details || '').trim(),
        createdAt: now,
        createdBy: {
          username: (me.username || '').toLowerCase(),
          name: me.name || ''
        }
      };

      await withHealth(async (db) => {
        await db.collection('health_midwives').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] midwives create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save midwife record.' });
    }
  });

  // ---------- SCHEDULES + CALENDAR ----------
  router.get('/api/health/schedules', requireAuth, async (req, res) => {
    const {
      page, limit, status, q, from, to, sort, mine
    } = parsePaging(req);
    const { type = '' } = req.query;

    const me = req.session.user || {};
    const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;

    const query = {};

    if (type) query.type = String(type);
    if (status) query.status = String(status);

    Object.assign(query, buildSearchQuery(['residentName', 'residentContact', 'notes'], q));
    Object.assign(query, buildDateRangeQuery('preferredDate', from, to));

    if (!isAdmin && mine !== 'false' && me.username) {
      query.residentUsername = me.username.toLowerCase();
    }

    const data = await withHealth(async (db) => {
      const col = db.collection('health_schedules');
      const sortSpec = { preferredDate: sort === 'asc' ? 1 : -1 };
      const cursor = col.find(query).sort(sortSpec);
      const total = await col.countDocuments(query);
      const rows = await cursor.skip((page - 1) * limit).limit(limit).toArray();
      return { rows, total };
    });

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
    res.json({
      ok: true,
      rows: data.rows || [],
      total: data.total || 0,
      page,
      limit,
      totalPages
    });
  });

  // Debug: Test route to verify router is working
  router.get('/api/health/test', (req, res) => {
    res.json({ ok: true, message: 'Health router is working', path: req.path });
  });

  // Schedule submission endpoint
  router.post('/api/health/schedules', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const {
        type = '',
        preferredDate = '',
        preferredTime = '',
        notes = '',
        assignedMidwifeId = '',
        midwifeName = ''
      } = b;

      const allowedTypes = ['prenatal', 'infant', 'health', 'general'];
      const t = String(type || '').toLowerCase();
      if (!allowedTypes.includes(t)) {
        return res.status(400).json({ ok: false, message: 'Invalid schedule type.' });
      }

      if (!preferredDate) {
        return res.status(400).json({ ok: false, message: 'Preferred date is required.' });
      }

      const d = new Date(preferredDate);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ ok: false, message: 'Invalid preferred date.' });
      }

      const me = req.session.user || {};
      const isAdmin = /^(admin)$/i.test(me?.role || '') || me?.isAdmin === true;

      let status = 'Pending';
      if (isAdmin && b.status) {
        status = String(b.status);
      }

      const now = new Date();

      const doc = {
        type: t,
        preferredDate: d,
        preferredTime: String(preferredTime || '').trim(),
        notes: String(notes || '').trim(),
        status,
        residentUsername: (me.username || '').toLowerCase(),
        residentName: me.name || '',
        residentContact: me.address || '',
        createdAt: now
      };

      if (assignedMidwifeId) {
        doc.assignedMidwifeId = new ObjectId(assignedMidwifeId);
      }
      if (midwifeName) {
        doc.midwifeName = String(midwifeName).trim();
      }

      await withHealth(async (db) => {
        await db.collection('health_schedules').insertOne(doc);
      });

      res.json({ ok: true, row: doc });
    } catch (e) {
      console.error('[health] schedule create error', e);
      res.status(500).json({ ok: false, message: 'Failed to save schedule.' });
    }
  });

  router.get('/api/health/calendar', requireAuth, async (req, res) => {
    try {
      const year = parseInt(req.query.year, 10);
      const month = parseInt(req.query.month, 10); // 0-based
      if (Number.isNaN(year) || Number.isNaN(month)) {
        return res.status(400).json({ ok: false, message: 'Invalid year/month.' });
      }

      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const items = await withHealth(async (db) => {
        const col = db.collection('health_schedules');
        return col.find({
          preferredDate: { $gte: start, $lte: end }
        }).sort({ preferredDate: 1 }).toArray();
      }) || [];

      res.json({ ok: true, items });
    } catch (e) {
      console.error('[health] calendar error', e);
      res.status(500).json({ ok: false, message: 'Failed to load calendar.' });
    }
  });

  // ---------- DETAIL ENDPOINTS FOR USER VIEW ----------
  async function deleteById(res, collection, id) {
    try {
      let _id;
      try {
        _id = new ObjectId(id);
      } catch {
        return res.status(400).json({ ok: false, message: 'Invalid record id.' });
      }

      const result = await withHealth(async (db) => {
        const col = db.collection(collection);
        const deleted = await col.deleteOne({ _id });
        return deleted.deletedCount > 0;
      });

      if (result) {
        res.json({ ok: true, message: 'Record deleted successfully.' });
      } else {
        res.status(404).json({ ok: false, message: 'Record not found.' });
      }
    } catch (e) {
      console.error('[health] delete error', e);
      res.status(500).json({ ok: false, message: 'Failed to delete record.' });
    }
  }

  async function getById(res, collection, id) {
    let _id;
    try {
      _id = new ObjectId(id);
    } catch {
      return res.status(400).json({ ok: false, message: 'Invalid id.' });
    }

    const row = await withHealth(async (db) => {
      return db.collection(collection).findOne({ _id });
    });
    if (!row) {
      return res.status(404).json({ ok: false, message: 'Not found' });
    }
    return res.json({ ok: true, row });
  }

  router.get('/api/health/patient-data/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_patient_data', req.params.id);
  });
  router.get('/api/health/family-planning/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_family_planning', req.params.id);
  });
  router.get('/api/health/post-partum/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_post_partum', req.params.id);
  });
  router.get('/api/health/child-immunization/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_child_immunization', req.params.id);
  });
  router.get('/api/health/individual-treatment/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_individual_treatment', req.params.id);
  });
  router.get('/api/health/patient-records/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_patient_records', req.params.id);
  });
  router.get('/api/health/pregnancy-tracking/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_pregnancy_tracking', req.params.id);
  });
  router.get('/api/health/prenatal/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_prenatal_visits', req.params.id);
  });
  router.get('/api/health/schedules/:id', requireAuth, async (req, res) => {
    await getById(res, 'health_schedules', req.params.id);
  });

  // ---------- DELETE endpoints ----------
  router.delete('/api/health/patient-data/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_patient_data', req.params.id);
  });
  router.delete('/api/health/family-planning/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_family_planning', req.params.id);
  });
  router.delete('/api/health/post-partum/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_post_partum', req.params.id);
  });
  router.delete('/api/health/child-immunization/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_child_immunization', req.params.id);
  });
  router.delete('/api/health/individual-treatment/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_individual_treatment', req.params.id);
  });
  router.delete('/api/health/patient-records/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_patient_records', req.params.id);
  });
  router.delete('/api/health/pregnancy-tracking/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_pregnancy_tracking', req.params.id);
  });
  router.delete('/api/health/prenatal/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_prenatal_visits', req.params.id);
  });
  router.delete('/api/health/schedules/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_schedules', req.params.id);
  });
  router.delete('/api/health/medicines/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_medicines', req.params.id);
  });
  router.delete('/api/health/midwives/:id', requireAuth, requireAdmin, async (req, res) => {
    await deleteById(res, 'health_midwives', req.params.id);
  });

  // Update schedule endpoint (for status changes, midwife assignment, etc.)
  router.put('/api/health/schedules/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      let _id;
      try {
        _id = new ObjectId(req.params.id);
      } catch {
        return res.status(400).json({ ok: false, message: 'Invalid schedule id.' });
      }

      const b = req.body || {};
      const {
        status = '',
        preferredDate = '',
        preferredTime = '',
        notes = '',
        assignedMidwifeId = '',
        midwifeName = '',
        confirmedDate = '',
        confirmedTime = ''
      } = b;

      const update = {};
      const now = new Date();

      if (status) {
        const validStatuses = ['Pending', 'Scheduled', 'Completed', 'Cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ ok: false, message: 'Invalid status.' });
        }
        update.status = status;
        update.updatedAt = now;
        
        // Set completion date if status is Completed
        if (status === 'Completed' && !b.completedAt) {
          update.completedAt = now;
        }
      }

      if (preferredDate) {
        const d = new Date(preferredDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid preferred date.' });
        }
        update.preferredDate = d;
        update.updatedAt = now;
      }

      if (preferredTime !== undefined) {
        update.preferredTime = String(preferredTime || '').trim();
        update.updatedAt = now;
      }

      if (notes !== undefined) {
        update.notes = String(notes || '').trim();
        update.updatedAt = now;
      }

      if (assignedMidwifeId) {
        try {
          update.assignedMidwifeId = new ObjectId(assignedMidwifeId);
          update.updatedAt = now;
        } catch {
          return res.status(400).json({ ok: false, message: 'Invalid midwife id.' });
        }
      }

      if (midwifeName !== undefined) {
        update.midwifeName = String(midwifeName || '').trim();
        update.updatedAt = now;
      }

      if (confirmedDate) {
        const d = new Date(confirmedDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ ok: false, message: 'Invalid confirmed date.' });
        }
        update.confirmedDate = d;
        update.updatedAt = now;
      }

      if (confirmedTime !== undefined) {
        update.confirmedTime = String(confirmedTime || '').trim();
        update.updatedAt = now;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ ok: false, message: 'No fields to update.' });
      }

      const me = req.session.user || {};
      update.updatedBy = {
        username: (me.username || '').toLowerCase(),
        name: me.name || ''
      };

      const result = await withHealth(async (db) => {
        const col = db.collection('health_schedules');
        const existing = await col.findOne({ _id });
        if (!existing) {
          return null;
        }

        await col.updateOne(
          { _id },
          { $set: update }
        );

        return await col.findOne({ _id });
      });

      if (!result) {
        return res.status(404).json({ ok: false, message: 'Schedule not found.' });
      }

      res.json({ ok: true, row: result });
    } catch (e) {
      console.error('[health] schedule update error', e);
      res.status(500).json({ ok: false, message: 'Failed to update schedule.' });
    }
  });

  // ---------- PRINT VIEWS ----------
  router.get('/health/patient-records/:id/print', requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).send('Invalid record id.');
    }

    const row = await withHealth(async (db) =>
      db.collection('health_patient_records').findOne({ _id })
    );
    if (!row) return res.status(404).send('Patient record not found.');

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Patient Record - ${(row.surname || '')}, ${(row.givenName || '')}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; background:#fff; color:#222; }
      h1 { text-align: center; margin-bottom: 24px; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .section { margin-top: 18px; }
      .label { font-weight: bold; display:inline-block; min-width:140px; }
      @media print {
        button { display: none; }
        body { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>Barangay Patient Record</h1>
    <div class="meta">
      <div><span class="label">Name:</span> ${(row.surname || '')}, ${(row.givenName || '')} ${(row.middleName || '')}</div>
      <div><span class="label">Age:</span> ${row.age ?? ''}</div>
      <div><span class="label">Gender:</span> ${row.gender || ''}</div>
      <div><span class="label">Barangay:</span> ${row.barangay || ''}</div>
      <div><span class="label">Contact:</span> ${row.contactNumber || ''}</div>
      <div><span class="label">Status:</span> ${row.status || ''}</div>
    </div>
    <div class="section">
      <h3>Health Profile</h3>
      <div><span class="label">Philhealth:</span> ${row.philhealth || ''}</div>
      <div><span class="label">Civil Status:</span> ${row.civilStatus || ''}</div>
      <div><span class="label">Height (cm):</span> ${row.height ?? ''}</div>
      <div><span class="label">Weight (kg):</span> ${row.weight ?? ''}</div>
      <div><span class="label">Blood Pressure:</span> ${row.bloodPressure || ''}</div>
      <div><span class="label">CVD / Cardio Notes:</span> ${row.cvdStatus || ''}</div>
      <div><span class="label">NCD / Chronic Notes:</span> ${row.ncdStatus || ''}</div>
      <div><span class="label">Chronic Conditions:</span> ${row.chronicConditions || ''}</div>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/schedules/:id/print', requireAuth, async (req, res) => {
    let _id;
    try {
      _id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).send('Invalid schedule id.');
    }

    const row = await withHealth(async (db) =>
      db.collection('health_schedules').findOne({ _id })
    );
    if (!row) return res.status(404).send('Schedule not found.');

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Health Schedule - ${row.type || ''}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; background:#fff; color:#222; }
      h1 { text-align: center; margin-bottom: 24px; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .label { font-weight: bold; display:inline-block; min-width:160px; }
      @media print {
        button { display: none; }
        body { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>Health Schedule Slip</h1>
    <div class="meta">
      <div><span class="label">Resident Name:</span> ${row.residentName || ''}</div>
      <div><span class="label">Checkup Type:</span> ${row.type || ''}</div>
      <div><span class="label">Preferred Date:</span> ${row.preferredDate ? new Date(row.preferredDate).toLocaleString() : ''}</div>
      <div><span class="label">Preferred Time:</span> ${row.preferredTime || ''}</div>
      <div><span class="label">Status:</span> ${row.status || ''}</div>
      <div><span class="label">Assigned Midwife:</span> ${row.midwifeName || ''}</div>
      <div><span class="label">Notes:</span> ${row.notes || ''}</div>
    </div>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Generic print endpoint helper
  async function getPrintView(collection, id, title, fields) {
    let _id;
    try {
      _id = new ObjectId(id);
    } catch {
      return null;
    }

    const row = await withHealth(async (db) =>
      db.collection(collection).findOne({ _id })
    );
    if (!row) return null;

    const fieldsHtml = fields.map(f => {
      const value = f.get ? f.get(row) : (row[f.key] || '');
      const displayValue = f.format ? f.format(value) : value;
      return `<div><span class="label">${f.label}:</span> ${displayValue}</div>`;
    }).join('');

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; background:#fff; color:#222; }
      h1 { text-align: center; margin-bottom: 24px; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .section { margin-top: 18px; }
      .label { font-weight: bold; display:inline-block; min-width:160px; }
      @media print {
        button { display: none; }
        body { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print</button>
    <h1>${title}</h1>
    <div class="meta">${fieldsHtml}</div>
  </body>
</html>`;
  }

  // Print endpoints for other record types
  router.get('/health/family-planning/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_family_planning', req.params.id, 'Family Planning Record', [
      { key: 'lastName', label: 'Last Name' },
      { key: 'givenName', label: 'Given Name' },
      { key: 'middleInitial', label: 'Middle Initial' },
      { key: 'age', label: 'Age' },
      { key: 'address', label: 'Address' },
      { key: 'contactNumber', label: 'Contact Number' },
      { key: 'clientType', label: 'Client Type' },
      { key: 'fpMethod', label: 'FP Method' },
      { key: 'dateOfBirth', label: 'Date of Birth', format: (v) => v ? new Date(v).toLocaleDateString() : '' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/post-partum/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_post_partum', req.params.id, 'Post-Partum Record', [
      { key: 'motherName', label: 'Mother Name' },
      { key: 'address', label: 'Address' },
      { key: 'ageOfMother', label: 'Age' },
      { key: 'deliveryDateTime', label: 'Delivery Date/Time', format: (v) => v ? new Date(v).toLocaleString() : '' },
      { key: 'placeOfDelivery', label: 'Place of Delivery' },
      { key: 'gender', label: 'Gender' },
      { key: 'weight', label: 'Weight (kg)' },
      { key: 'tetanusStatus', label: 'Tetanus Status' },
      { key: 'details30Min', label: '30-Minute Details' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/child-immunization/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_child_immunization', req.params.id, 'Child Immunization Record', [
      { key: 'childName', label: 'Child Name' },
      { key: 'birthday', label: 'Birthday', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
      { key: 'age', label: 'Age (months)' },
      { key: 'gender', label: 'Gender' },
      { key: 'address', label: 'Address' },
      { key: 'motherName', label: 'Mother Name' },
      { key: 'fatherName', label: 'Father Name' },
      { key: 'bcgDate', label: 'BCG Date', format: (v) => v ? new Date(v).toLocaleDateString() : 'Not administered' },
      { key: 'hepBBirthDate', label: 'Hep B Birth', format: (v) => v ? new Date(v).toLocaleDateString() : 'Not administered' },
      { key: 'pentavalent1Date', label: 'Pentavalent 1', format: (v) => v ? new Date(v).toLocaleDateString() : 'Not administered' },
      { key: 'opv1Date', label: 'OPV 1', format: (v) => v ? new Date(v).toLocaleDateString() : 'Not administered' },
      { key: 'mmr1Date', label: 'MMR 1', format: (v) => v ? new Date(v).toLocaleDateString() : 'Not administered' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/individual-treatment/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_individual_treatment', req.params.id, 'Individual Treatment Record', [
      { key: 'patientName', label: 'Patient Name' },
      { key: 'consultationDate', label: 'Consultation Date', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
      { key: 'age', label: 'Age' },
      { key: 'address', label: 'Address' },
      { key: 'sex', label: 'Sex' },
      { key: 'philhealth', label: 'Philhealth' },
      { key: 'bloodPressure', label: 'Blood Pressure' },
      { key: 'temperature', label: 'Temperature' },
      { key: 'historyOfIllness', label: 'History of Illness' },
      { key: 'assessment', label: 'Assessment' },
      { key: 'treatmentPlan', label: 'Treatment Plan' },
      { key: 'status', label: 'Status' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/pregnancy-tracking/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_pregnancy_tracking', req.params.id, 'Pregnancy Tracking Record', [
      { key: 'name', label: 'Name' },
      { key: 'age', label: 'Age' },
      { key: 'completeAddress', label: 'Address' },
      { key: 'lmp', label: 'LMP', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
      { key: 'edd', label: 'EDD', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
      { key: 'prenatalConsultation', label: 'Prenatal Consultation' },
      { key: 'healthFacility', label: 'Health Facility' },
      { key: 'contactNumber', label: 'Contact Number' },
      { key: 'gravida', label: 'Gravida (G)' },
      { key: 'para', label: 'Para (P)' },
      { key: 'riskLevel', label: 'Risk Level' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/health/prenatal/:id/print', requireAuth, async (req, res) => {
    const html = await getPrintView('health_prenatal_visits', req.params.id, 'Pre-Natal Visit Record', [
      { key: 'patientName', label: 'Patient Name' },
      { key: 'age', label: 'Age' },
      { key: 'address', label: 'Address' },
      { key: 'visitDate', label: 'Visit Date', format: (v) => v ? new Date(v).toLocaleString() : '' },
      { key: 'trimester', label: 'Trimester' },
      { key: 'bloodPressure', label: 'Blood Pressure' },
      { key: 'weight', label: 'Weight (kg)' },
      { key: 'fundicHeight', label: 'Fundic Height' },
      { key: 'fetalHeartTone', label: 'Fetal Heart Tone' },
      { key: 'midwifeName', label: 'Midwife Name' },
      { key: 'remarks', label: 'Remarks' }
    ]);
    if (!html) return res.status(404).send('Record not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  return router;
};


