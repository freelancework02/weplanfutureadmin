// controllers/dashboardController.js
const pool = require('../Db/index');

/**
 * Helper: safe integer parse for query params
 */
const safeLimit = (v, def = 5, max = 50) => {
  const n = Number(v);
  if (!Number.isFinite(n) || Number.isNaN(n)) return def;
  return Math.min(Math.max(1, Math.floor(n)), max);
};

/**
 * GET /api/dashboard/counts
 * Returns counts for main resources.
 */
exports.counts = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    // You can add/remove tables here depending on your schema
    const queries = {
      events: 'SELECT COUNT(*) AS cnt FROM events',
      galleries: 'SELECT COUNT(*) AS cnt FROM galleries',
      blogs: 'SELECT COUNT(*) AS cnt FROM blogs',
      subscribers: 'SELECT COUNT(*) AS cnt FROM subscribers'
    };

    const results = {};
    // Run queries sequentially to keep code simple and compatible with many MySQL hosts
    for (const key of Object.keys(queries)) {
      try {
        const [rows] = await conn.query(queries[key]);
        results[key] = (rows && rows[0] && Number(rows[0].cnt)) ? Number(rows[0].cnt) : 0;
      } catch (e) {
        // If a table doesn't exist, return zero for that count but keep going
        console.warn(`dashboard counts: failed query for ${key}:`, e.message);
        results[key] = 0;
      }
    }

    res.json({ ok: true, counts: results });
  } catch (err) {
    console.error('dashboard.counts error:', err);
    res.status(500).json({ ok: false, error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};

/**
 * GET /api/dashboard/latest
 * Query params:
 *   type=events|blogs|galleries   (optional — default: returns all three)
 *   limit=number                  (optional, default 5)
 *
 * Returns latest items (no blobs) for requested resource(s).
 */
exports.latest = async (req, res) => {
  const type = (req.query.type || '').toLowerCase();
  const limit = safeLimit(req.query.limit, 5, 50);
  const conn = await pool.getConnection();

  try {
    const out = {};

    const fetchEvents = async () => {
      const q = `
        SELECT id, title, event_date, hosted_by, status, created_at, updated_at
        FROM events
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const [rows] = await conn.query(q, [limit]);
      return rows;
    };

    const fetchBlogs = async () => {
      const q = `
        SELECT id, title, LEFT(content_html, 400) AS excerpt, is_published, created_at, updated_at
        FROM blogs
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const [rows] = await conn.query(q, [limit]);
      return rows;
    };

    const fetchGalleries = async () => {
      const q = `
        SELECT id, title, description, cover_image_id, created_at, updated_at
        FROM galleries
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const [rows] = await conn.query(q, [limit]);
      return rows;
    };

    if (!type || type === 'events') out.events = await fetchEvents();
    if (!type || type === 'blogs') out.blogs = await fetchBlogs();
    if (!type || type === 'galleries') out.galleries = await fetchGalleries();

    // If user asked for only one type, return that directly as "items"
    if (type && ['events', 'blogs', 'galleries'].includes(type)) {
      return res.json({ ok: true, type, limit, items: out[type] || [] });
    }

    res.json({ ok: true, limit, latest: out });
  } catch (err) {
    console.error('dashboard.latest error:', err);
    res.status(500).json({ ok: false, error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};

/**
 * GET /api/dashboard (summary)
 * Returns counts + latest items (small payload)
 */
exports.summary = async (req, res) => {
  const limit = safeLimit(req.query.limit, 5, 5);
  const conn = await pool.getConnection();

  try {
    // counts (try to run in parallel-ish)
    const countsPromises = {
      events: conn.query('SELECT COUNT(*) AS cnt FROM events'),
      galleries: conn.query('SELECT COUNT(*) AS cnt FROM galleries'),
      blogs: conn.query('SELECT COUNT(*) AS cnt FROM blogs'),
      subscribers: conn.query('SELECT COUNT(*) AS cnt FROM subscribers')
    };

    // Use Promise.allSettled to avoid total failure if a table is missing
    const settled = await Promise.allSettled(Object.values(countsPromises));
    const keys = Object.keys(countsPromises);
    const counts = {};
    settled.forEach((s, i) => {
      const key = keys[i];
      if (s.status === 'fulfilled') {
        const rows = s.value[0];
        counts[key] = (rows && rows[0] && Number(rows[0].cnt)) ? Number(rows[0].cnt) : 0;
      } else {
        console.warn(`dashboard.summary: count query for ${key} failed:`, s.reason && s.reason.message);
        counts[key] = 0;
      }
    });

    // latest items (limit)
    const [eventsRows] = await conn.query(
      `SELECT id, title, event_date, hosted_by, status, created_at FROM events ORDER BY created_at DESC LIMIT ?`, [limit]
    ).catch(e => { console.warn('events latest failed', e.message); return [[]]; });

    const [blogsRows] = await conn.query(
      `SELECT id, title, LEFT(content_html, 400) AS excerpt, is_published, created_at FROM blogs ORDER BY created_at DESC LIMIT ?`, [limit]
    ).catch(e => { console.warn('blogs latest failed', e.message); return [[]]; });

    const [galleriesRows] = await conn.query(
      `SELECT id, title, description, cover_image_id, created_at FROM galleries ORDER BY created_at DESC LIMIT ?`, [limit]
    ).catch(e => { console.warn('galleries latest failed', e.message); return [[]]; });

    res.json({
      ok: true,
      counts,
      latest: {
        events: eventsRows || [],
        blogs: blogsRows || [],
        galleries: galleriesRows || []
      }
    });
  } catch (err) {
    console.error('dashboard.summary error:', err);
    res.status(500).json({ ok: false, error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};
