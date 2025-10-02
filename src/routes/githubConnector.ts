import express from 'express';
import {GitHubConnectorService} from '../services/githubConnector';

const router = express.Router();
const githubConnectorService = new GitHubConnectorService();

// Test GitHub connection
router.post(
    '/test-connection',
    async (req: express.Request, res: express.Response) => {
        try {
            const config = req.body;
            console.log('Received connection test request:', config);
            const result = await githubConnectorService.validateConnection(
                config,
            );
            console.log('Validation result:', result);

            if (result.success) {
                res.json({success: true});
            } else {
                res.status(400).json(result.error);
            }
        } catch (error: any) {
            res.status(500).json({
                title: 'Connection Failed',
                message:
                    error.message || 'Failed to validate GitHub connection',
                details: JSON.stringify(
                    {
                        errors: [
                            {
                                reason: error.name || 'ConnectionError',
                                message:
                                    error.message || 'Unknown error occurred',
                            },
                        ],
                    },
                    null,
                    2,
                ),
            });
        }
    },
);

export default router;
