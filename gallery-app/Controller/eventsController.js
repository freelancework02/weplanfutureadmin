// controllers/eventsController.js
const pool = require('../Db/index');

// Helpers
const parseBool = v => (v === 'true' || v === '1' || v === 1 || v === 'on');
const ensureNumber = v => (v === undefined || v === null ? null : Number(v));
const bytesToMB = b => Math.round((b / (1024 * 1024)) * 10) / 10;

//
// CREATE EVENT (with multiple images)
// POST /api/events
// field for files: "images[]" (multer memoryStorage -> file.buffer available)
// body: title, event_date, hosted_by, link, address, description, status, coverIndex
//
exports.createEvent = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      title,
      event_date = null,
      hosted_by = null,
      link = null,
      address = null,
      description = null,
      status = '1',
      coverIndex = '0'
    } = req.body;

    if (!title || (!req.files || req.files.length === 0)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Title and at least one image required.' });
    }

    const [r] = await conn.query(
      `INSERT INTO events
        (title, event_date, hosted_by, link, address, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), event_date || null, hosted_by || null, link || null, address || null, description || null, parseBool(status) ? 1 : 0]
    );

    const eventId = r.insertId;

    const insertedImageIds = [];
    let idx = 0;
    for (const file of req.files) {
      const [ir] = await conn.query(
        `INSERT INTO event_images (event_id, image_name, image_blob, sort_order)
         VALUES (?, ?, ?, ?)`,
        [eventId, file.originalname, file.buffer, idx]
      );
      insertedImageIds.push(ir.insertId);
      idx++;
    }

    // set cover image if coverIndex within range
    const ci = Math.max(0, Math.min(insertedImageIds.length - 1, Number(coverIndex || 0)));
    if (insertedImageIds[ci]) {
      await conn.query(`UPDATE events SET cover_image_id = ? WHERE id = ?`, [insertedImageIds[ci], eventId]);
    }

    await conn.commit();
    return res.status(201).json({ ok: true, eventId, insertedImages: insertedImageIds.length });
  } catch (err) {
    try { await conn.rollback(); } catch(e) {}
    console.error('createEvent error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};

//
// CREATE SINGLE IMAGE (attach to an existing event)
// POST /api/events/image
// form fields: gallery_id OR event_id, optional sort_order
//
exports.createImage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const eventId = ensureNumber(req.body.event_id || req.body.eventId || req.body.event);
    if (!eventId) return res.status(400).json({ error: 'event_id is required.' });

    const [[exists]] = await conn.query(`SELECT id FROM events WHERE id = ?`, [eventId]);
    if (!exists) return res.status(404).json({ error: 'Event not found.' });

    const sort_order = ensureNumber(req.body.sort_order) || 0;
    const [r] = await conn.query(
      `INSERT INTO event_images (event_id, image_name, image_blob, sort_order)
       VALUES (?, ?, ?, ?)`,
      [eventId, req.file.originalname, req.file.buffer, sort_order]
    );

    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('createImage error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

//
// GET LIST (paginated)
// GET /api/events?page=1&per=12
//
exports.listEvents = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const per = Math.min(100, Number(req.query.per) || 12);
  const offset = (page - 1) * per;

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
         e.id, e.title, e.event_date, e.hosted_by, e.link, e.address, e.description,
         e.status, e.cover_image_id, e.created_at, e.updated_at,
         (SELECT COUNT(*) FROM event_images WHERE event_id = e.id) AS images_count
       FROM events e
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
      [per, offset]
    );

    return res.json({ page, per, data: rows });
  } catch (err) {
    console.error('listEvents error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

//
// GET single event + images
// GET /api/events/:id
//
exports.getEvent = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    const [[event]] = await conn.query(`SELECT * FROM events WHERE id = ?`, [id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const [images] = await conn.query(
      `SELECT id, image_name, CHAR_LENGTH(image_blob) AS size, sort_order, created_at
       FROM event_images WHERE event_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [id]
    );

    return res.json({ event, images });
  } catch (err) {
    console.error('getEvent error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

//
// GET single image blob
// GET /api/events/image/:imageId/blob
//
exports.getImageBlob = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    const [[img]] = await conn.query(`SELECT id, image_name, image_blob FROM event_images WHERE id = ?`, [id]);
    if (!img) return res.status(404).json({ error: 'Image not found' });

    // no mime stored; send as generic inline stream with original filename
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${img.image_name}"`);
    return res.send(img.image_blob);
  } catch (err) {
    console.error('getImageBlob error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

//
// UPDATE event: edit fields, append new images, optionally set cover by index
// PUT /api/events/:id
// Accepts multipart form data (images[])
// You can also send deleteImageIds (comma separated) if you prefer marking for deletion
//
exports.updateEvent = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const {
    title, event_date, hosted_by, link, address, description, status, coverIndex, deleteImageIds
  } = req.body;
  const files = req.files || [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // validate event exists
    const [[ev]] = await conn.query(`SELECT id FROM events WHERE id = ?`, [id]);
    if (!ev) {
      await conn.rollback();
      return res.status(404).json({ error: 'Event not found' });
    }

    const updateFields = [];
    const params = [];

    if (title !== undefined) { updateFields.push('title = ?'); params.push(title); }
    if (event_date !== undefined) { updateFields.push('event_date = ?'); params.push(event_date || null); }
    if (hosted_by !== undefined) { updateFields.push('hosted_by = ?'); params.push(hosted_by); }
    if (link !== undefined) { updateFields.push('link = ?'); params.push(link); }
    if (address !== undefined) { updateFields.push('address = ?'); params.push(address); }
    if (description !== undefined) { updateFields.push('description = ?'); params.push(description); }
    if (status !== undefined) { updateFields.push('status = ?'); params.push(parseBool(status) ? 1 : 0); }

    if (updateFields.length) {
      params.push(id);
      await conn.query(`UPDATE events SET ${updateFields.join(', ')} WHERE id = ?`, params);
    }

    // delete images if client asked (deleteImageIds is comma-separated)
    if (deleteImageIds) {
      const ids = String(deleteImageIds).split(',').map(x => Number(x)).filter(Boolean);
      if (ids.length) {
        // if any of those were cover_image_id, clear it
        await conn.query(`UPDATE events SET cover_image_id = NULL WHERE cover_image_id IN (?)`, [ids]);
        await conn.query(`DELETE FROM event_images WHERE id IN (?) AND event_id = ?`, [ids, id]);
      }
    }

    // append new images
    if (files.length) {
      const [[{ maxorder }]] = await conn.query(`SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM event_images WHERE event_id = ?`, [id]);
      let order = (maxorder === null ? -1 : maxorder);
      for (const f of files) {
        order++;
        await conn.query(`INSERT INTO event_images (event_id, image_name, image_blob, sort_order) VALUES (?, ?, ?, ?)`, [id, f.originalname, f.buffer, order]);
      }
    }

    // optionally set cover by index (offset into ordered images)
    if (coverIndex !== undefined) {
      const ci = Number(coverIndex);
      const [imgs] = await conn.query(
        `SELECT id FROM event_images WHERE event_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1 OFFSET ?`,
        [id, Math.max(0, ci)]
      );
      if (imgs.length) {
        await conn.query(`UPDATE events SET cover_image_id = ? WHERE id = ?`, [imgs[0].id, id]);
      }
    }

    await conn.commit();
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('updateEvent error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

//
// DELETE entire event (and images via cascade)
// DELETE /api/events/:id
//
exports.deleteEvent = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [r] = await pool.query(`DELETE FROM events WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteEvent error:', err);
    return res.status(500).json({ error: err.message });
  }
};

//
// DELETE single image
// DELETE /api/events/image/:imageId
//
exports.deleteImage = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // clear cover_image_id referencing this image
    await conn.query(`UPDATE events SET cover_image_id = NULL WHERE cover_image_id = ?`, [id]);

    const [r] = await conn.query(`DELETE FROM event_images WHERE id = ?`, [id]);
    await conn.commit();

    if (r.affectedRows === 0) return res.status(404).json({ error: 'Image not found' });
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('deleteImage error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};
