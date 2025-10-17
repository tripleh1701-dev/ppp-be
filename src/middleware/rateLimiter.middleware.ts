import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for login endpoint to prevent brute force attacks
 * Allows 5 login attempts per 15 minutes per IP
 */
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        success: false,
        error: 'Too many login attempts. Please try again later.',
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    // Skip rate limiting for successful logins (optional)
    skipSuccessfulRequests: true,
});

/**
 * General API rate limiter
 * Allows 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
