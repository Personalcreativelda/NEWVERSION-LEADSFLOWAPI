import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { LeadNotesService } from '../services/lead-notes.service';

const router = Router();
const notesService = new LeadNotesService();

router.use(authMiddleware);

// Get all notes for a lead
router.get('/:leadId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notes = await notesService.findAll(req.params.leadId, user.id);
    res.json(notes);
  } catch (error) {
    next(error);
  }
});

// Create a note
router.post('/:leadId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const note = await notesService.create(
      { lead_id: req.params.leadId, content: content.trim() },
      user.id
    );
    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

// Update a note
router.put('/:noteId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const note = await notesService.update(req.params.noteId, content.trim(), user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(note);
  } catch (error) {
    next(error);
  }
});

// Delete a note
router.delete('/:noteId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await notesService.delete(req.params.noteId, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
