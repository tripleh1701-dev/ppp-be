import express from 'express';
import cors from 'cors';
import githubConnectorRoutes from './routes/githubConnector';
import templatesRoutes from './routes/templates';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(
    cors({
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }),
);
app.use(express.json());

// Routes
app.use('/api/github', githubConnectorRoutes);
app.use('/api/templates', templatesRoutes);

// Error handling middleware
app.use(
    (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) => {
        console.error('Error:', err);
        res.status(500).json({
            title: 'Connection Failed',
            message: err.message || 'Internal Server Error',
            details: JSON.stringify(
                {
                    errors: [
                        {
                            reason: err.name || 'ServerError',
                            message:
                                err.message || 'An unexpected error occurred',
                        },
                    ],
                },
                null,
                2,
            ),
        });
    },
);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({status: 'ok'});
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
