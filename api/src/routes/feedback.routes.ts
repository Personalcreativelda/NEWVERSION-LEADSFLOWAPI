import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import pool from '../database/connection';

const router = Router();

// GET /api/feedback/summary — public endpoint: average rating + recent reviews
router.get('/summary', async (_req, res) => {
  try {
    const [avgRow, reviewsRow] = await Promise.all([
      pool.query(`
        SELECT
          ROUND(AVG(stars)::numeric, 1) AS average,
          COUNT(*)                       AS total
        FROM user_feedback
        WHERE type = 'rating' AND stars IS NOT NULL
      `),
      pool.query(`
        SELECT stars, message, user_name, created_at
        FROM user_feedback
        WHERE type = 'rating' AND stars >= 4 AND message IS NOT NULL AND TRIM(message) <> ''
        ORDER BY created_at DESC
        LIMIT 6
      `),
    ]);

    return res.json({
      success: true,
      average: parseFloat(avgRow.rows[0]?.average || '0') || 0,
      total: parseInt(avgRow.rows[0]?.total || '0', 10),
      reviews: reviewsRow.rows,
    });
  } catch (err: any) {
    console.error('[Feedback] GET /summary error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/feedback — submit rating or problem report (authenticated users)
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const { type, stars, message } = req.body;
    const userId = req.user?.id;

    if (!type || !['rating', 'problem'].includes(type)) {
      return res.status(400).json({ error: 'type must be "rating" or "problem"' });
    }
    if (type === 'rating' && (stars === undefined || stars === null)) {
      return res.status(400).json({ error: 'stars required for rating' });
    }
    if (type === 'problem' && !message?.trim()) {
      return res.status(400).json({ error: 'message required for problem report' });
    }

    // Fetch user info to store alongside feedback
    let userEmail: string | null = null;
    let userName: string | null = null;
    if (userId) {
      const userRow = await pool.query('SELECT email, name FROM users WHERE id = $1', [userId]);
      if (userRow.rows[0]) {
        userEmail = userRow.rows[0].email;
        userName  = userRow.rows[0].name;
      }
    }

    const result = await pool.query(
      `INSERT INTO user_feedback (user_id, type, stars, message, user_email, user_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId || null, type, type === 'rating' ? stars : null, message?.trim() || null, userEmail, userName]
    );

    return res.json({ success: true, id: result.rows[0].id });
  } catch (err: any) {
    console.error('[Feedback] POST error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
