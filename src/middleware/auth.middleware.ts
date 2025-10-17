import {Request, Response, NextFunction} from 'express';
import {JWTService} from '../services/jwt';

/**
 * Middleware to verify JWT token in requests
 */
export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const payload = JWTService.verifyToken(token);

        if (!payload) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
            });
        }

        // Attach user info to request object
        (req as any).user = payload;

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Authentication failed',
        });
    }
}

/**
 * Optional auth middleware - doesn't fail if token is missing
 */
export function optionalAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = JWTService.verifyToken(token);

            if (payload) {
                (req as any).user = payload;
            }
        }

        next();
    } catch (error) {
        // Continue without auth
        next();
    }
}
