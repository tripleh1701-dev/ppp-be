import express from 'express';
import {templatesService} from '../services/templates';

const router = express.Router();

// Get all templates
router.get('/', async (req, res) => {
    try {
        const templates = await templatesService.list();
        res.json(templates);
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({error: 'Failed to get templates'});
    }
});

// Get template by ID
router.get('/:id', async (req, res) => {
    try {
        const template = await templatesService.get(req.params.id);
        if (!template) {
            return res.status(404).json({error: 'Template not found'});
        }
        res.json(template);
    } catch (error) {
        console.error('Error getting template:', error);
        res.status(500).json({error: 'Failed to get template'});
    }
});

// Create new template
router.post('/', async (req, res) => {
    try {
        const template = await templatesService.create(req.body);
        res.status(201).json(template);
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({error: 'Failed to create template'});
    }
});

// Update template
router.put('/:id', async (req, res) => {
    try {
        const template = await templatesService.update(req.params.id, req.body);
        if (!template) {
            return res.status(404).json({error: 'Template not found'});
        }
        res.json(template);
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({error: 'Failed to update template'});
    }
});

// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await templatesService.remove(req.params.id);
        if (!deleted) {
            return res.status(404).json({error: 'Template not found'});
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({error: 'Failed to delete template'});
    }
});

export default router;
