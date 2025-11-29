// routes/community.js (SAFE INDEXING + NULL-SAFE LISTS)
const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');

let multer;
try { multer = require('multer'); } catch {
  console.warn('[community] multer not installed — run: npm i multer');
}

module.exports = function communityRoutes(withDb, requireAuth, requireAdmin) {
  const router = express.Router();

  // serve uploads
  router.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ----- Multer (optional upload) -----
  let upload = null;
  if (multer) {
    const storage = multer.diskStorage({
      destination: (_, __, cb) => cb(null, path.join(process.cwd(), 'uploads')),
      filename: (_, file, cb) => {
        const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
        cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext);
      }
    });
    upload = multer({
      storage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        cb(/image\/(png|jpe?g|gif|webp)/i.test(file.mimetype) ? null : new Error('Only images allowed'));
      }
    });
  }

  // ----- Seed + Indexes (idempotent) -----
  async function ensureIndexesAndSeed(db) {
    const col = db.collection('community_posts');

    // 1) Text index: create only if there is NO existing text index
    try {
      const idxs = await col.indexes(); // [{ key: {...}, name: '...' }, ...]
      const hasText = idxs.some(i => Object.values(i.key || {}).some(v => v === 'text'));
      if (!hasText) {
        // keep the text index minimal and stable so we never conflict later
        await col.createIndex({ title: 'text', body: 'text' }, { name: 'text_search' });
      }
    } catch (e) {
      console.warn('[community] index check/create (text) warning:', e.message);
      // do not throw — we can run without the new index
    }

    // 2) Support indexes (normal)
    try { await col.createIndex({ pinned: -1, _id: -1 }, { name: 'pin_sort' }); } catch {}
    try { await col.createIndex({ createdAt: -1 }, { name: 'createdAt_desc' }); } catch {}

    // Seed demo data once
    const count = await col.countDocuments().catch(() => 0);
    if (count > 0) return;

    await col.insertMany([
      {
        type: 'post',
        title: 'Booster Shot Available',
        body: 'Barangay Health Workers will be offering free booster shots. Bring valid ID.',
        imageUrl: 'https://images.unsplash.com/photo-1600959907703-125ba1374a12?q=80&w=1200&auto=format&fit=crop',
        category: 'Health',
        author: { username: 'admin', name: 'Admin' },
        likes: [], comments: [],
        pinned: true,
        createdAt: new Date()
      },
      {
        type: 'event',
        title: 'Barangay Clean-up Drive',
        body: 'Help us keep our community clean this Saturday!',
        imageUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1200&auto=format&fit=crop',
        category: 'Environment',
        event: { startDate: new Date(), endDate: new Date(), location: 'Barangay Hall' },
        author: { username: 'admin', name: 'Admin' },
        likes: [], comments: [],
        pinned: false,
        createdAt: new Date()
      }
    ]);
  }

  // ----- Page -----
  router.get('/community', requireAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'community.html'));
  });

  // ----- List posts (safe) -----
  router.get('/api/community/posts', requireAuth, async (req, res) => {
    const { q = '', category = '', type = '', cursor = '', limit = '10', on = '' } = req.query;
    const take = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));

    const filter = {};
    const and = [];

    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ title: rx }, { body: rx }, { category: rx }] });
    }
    if (category) and.push({ category });
    if (type) and.push({ type });

    if (on) {
      const d = new Date(on);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      and.push({
        $or: [
          { type: 'post', createdAt: { $gte: dayStart, $lt: dayEnd } },
          { type: 'event', 'event.startDate': { $lte: dayEnd }, 'event.endDate': { $gte: dayStart } }
        ]
      });
    }

    if (and.length) filter.$and = and;
    if (cursor) filter._id = { $lt: new ObjectId(cursor) };

    let items = [];
    try {
      items = await withDb(async (db) => {
        const col = db.collection('community_posts');
        await ensureIndexesAndSeed(db);
        return col.find(filter).sort({ pinned: -1, _id: -1 }).limit(take).toArray();
      }) || [];
    } catch (e) {
      console.error('List posts error:', e);
      items = [];
    }

    const nextCursor = items.length === take ? items[items.length - 1]._id : null;
    res.json({ ok: true, items, nextCursor });
  });

  // ----- Upcoming events (safe) -----
  router.get('/api/community/events', requireAuth, async (req, res) => {
    const { from = '', limit = '5' } = req.query;
    const take = Math.max(1, Math.min(20, parseInt(limit, 10) || 5));
    const fromDate = from ? new Date(from) : new Date();
    fromDate.setHours(0, 0, 0, 0);

    let items = [];
    try {
      items = await withDb(async (db) => {
        const col = db.collection('community_posts');
        await ensureIndexesAndSeed(db);
        return col.find({
          type: 'event',
          'event.endDate': { $gte: fromDate }
        }).sort({ 'event.startDate': 1 }).limit(take).toArray();
      }) || [];
    } catch (e) {
      console.error('Upcoming events error:', e);
      items = [];
    }

    res.json({ ok: true, items });
  });

  // ----- Calendar data (safe) -----
  router.get('/api/community/calendar', requireAuth, async (req, res) => {
    const y = parseInt(req.query.year, 10);
    const m = parseInt(req.query.month, 10);
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0, 23, 59, 59, 999);

    let items = [];
    try {
      items = await withDb(async (db) => {
        const col = db.collection('community_posts');
        await ensureIndexesAndSeed(db);
        return col.find({
          type: 'event',
          $or: [
            { 'event.startDate': { $gte: first, $lte: last } },
            { 'event.endDate':   { $gte: first, $lte: last } },
            { 'event.startDate': { $lte: first }, 'event.endDate': { $gte: last } }
          ]
        }).toArray();
      }) || [];
    } catch (e) {
      console.error('Calendar error:', e);
      items = [];
    }

    res.json({ ok: true, items });
  });

  // ----- Create post/event -----
  router.post('/api/community/posts', requireAdmin, (req, res) => {
    if (!upload) return res.status(501).json({ ok: false, message: 'Image upload disabled. Install multer: npm i multer' });

    upload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ ok: false, message: err.message });

      const {
        type = 'post',
        title = '',
        body = '',
        category = '',
        imageUrl = '',
        startDate = '',
        endDate = '',
        location = ''
      } = req.body;

      if (!title.trim()) return res.status(400).json({ ok: false, message: 'Title is required' });

      const url = req.file ? '/uploads/' + req.file.filename : (imageUrl || '').trim();

      const doc = {
        type: ['post', 'event'].includes(type) ? type : 'post',
        title: title.trim(),
        body: body.trim(),
        category: category.trim(),
        imageUrl: url || null,
        author: { username: req.session.user?.username || 'admin', name: req.session.user?.name || 'Admin' },
        likes: [],
        comments: [],
        pinned: false,
        createdAt: new Date()
      };

      if (doc.type === 'event') {
        doc.event = {
          startDate: startDate ? new Date(startDate) : null,
          endDate:   endDate   ? new Date(endDate)   : null,
          location: location.trim()
        };
      }

      try {
        const saved = await withDb(async (db) => {
          const col = db.collection('community_posts');
          await ensureIndexesAndSeed(db);
          const r = await col.insertOne(doc);
          return { ...doc, _id: r.insertedId };
        });
        res.json({ ok: true, item: saved });
      } catch (e) {
        console.error('Create post error:', e);
        res.status(500).json({ ok: false, message: 'Failed to create post' });
      }
    });
  });

  // ----- Toggle like -----
  router.post('/api/community/like/:id', requireAuth, async (req, res) => {
    const user = req.session.user?.username || 'user';
    const id = new ObjectId(req.params.id);

    try {
      const updated = await withDb(async (db) => {
        const col = db.collection('community_posts');
        const doc = await col.findOne({ _id: id });
        if (!doc) return null;
        const has = (doc.likes || []).includes(user);
        await col.updateOne({ _id: id }, has ? { $pull: { likes: user } } : { $addToSet: { likes: user } });
        return await col.findOne({ _id: id });
      });
      if (!updated) return res.status(404).json({ ok: false, message: 'Post not found' });
      res.json({ ok: true, item: updated });
    } catch (e) {
      console.error('Like error:', e);
      res.status(500).json({ ok: false, message: 'Failed to like/unlike' });
    }
  });

  // ----- Add comment -----
  router.post('/api/community/comment/:id', requireAuth, async (req, res) => {
    const { text = '' } = req.body || {};
    if (!text.trim()) return res.status(400).json({ ok: false, message: 'Comment cannot be empty' });
    const id = new ObjectId(req.params.id);
    const author = { username: req.session.user?.username || 'user', name: req.session.user?.name || 'User' };

    try {
      const updated = await withDb(async (db) => {
        const col = db.collection('community_posts');
        const c = { _id: new ObjectId(), text: text.trim(), author, createdAt: new Date() };
        await col.updateOne({ _id: id }, { $push: { comments: c } });
        return await col.findOne({ _id: id });
      });
      res.json({ ok: true, item: updated });
    } catch (e) {
      console.error('Comment error:', e);
      res.status(500).json({ ok: false, message: 'Failed to add comment' });
    }
  });

  // ----- Pin / unpin (admin only) -----
  router.post('/api/community/pin/:id', requireAdmin, async (req, res) => {
    const { pinned = true } = req.body || {};
    const id = new ObjectId(req.params.id);
    try {
      const updated = await withDb(async (db) => {
        const col = db.collection('community_posts');
        await col.updateOne({ _id: id }, { $set: { pinned: !!pinned } });
        return await col.findOne({ _id: id });
      });
      res.json({ ok: true, item: updated });
    } catch (e) {
      console.error('Pin error:', e);
      res.status(500).json({ ok: false, message: 'Failed to pin/unpin' });
    }
  });

  // ----- Delete (admin) -----
  router.delete('/api/community/posts/:id', requireAdmin, async (req, res) => {
    try {
      await withDb(async (db) => {
        await db.collection('community_posts').deleteOne({ _id: new ObjectId(req.params.id) });
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('Delete error:', e);
      res.status(500).json({ ok: false, message: 'Failed to delete post' });
    }
  });

  return router;
};
