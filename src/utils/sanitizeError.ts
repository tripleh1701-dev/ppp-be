/**
 * Sanitize error objects to remove sensitive data before logging
 * Prevents passwords, tokens, and other sensitive data from appearing in logs
 */

interface SanitizedError {
    message: string;
    code?: string;
    [key: string]: any;
}

const SENSITIVE_FIELDS = [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'session',
    'apikey',
    'api_key',
    'private_key',
    'access_token',
    'refresh_token',
];

/**
 * Remove sensitive fields from an object recursively
 */
function sanitizeObject(obj: any, depth = 0): any {
    if (depth > 10) return '[Max Depth Reached]'; // Prevent infinite recursion

    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeObject(item, depth + 1));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        // Check if key contains any sensitive field name
        const isSensitive = SENSITIVE_FIELDS.some((field) =>
            lowerKey.includes(field),
        );

        if (isSensitive) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
            sanitized[key] = sanitizeObject(value, depth + 1);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Sanitize an error object for logging
 */
export function sanitizeError(error: any): SanitizedError {
    if (!error) {
        return {message: 'Unknown error'};
    }

    // If it's a string, return it
    if (typeof error === 'string') {
        return {message: error};
    }

    // If it's an Error object
    if (error instanceof Error) {
        const sanitized: SanitizedError = {
            message: error.message,
            name: error.name,
            stack:
                process.env.NODE_ENV === 'development'
                    ? error.stack
                    : undefined,
        };

        // Add any additional properties from the error
        for (const [key, value] of Object.entries(error)) {
            if (key !== 'message' && key !== 'name' && key !== 'stack') {
                sanitized[key] = sanitizeObject(value);
            }
        }

        return sanitized;
    }

    // For any other object
    return sanitizeObject(error);
}

/**
 * Safe console.error that sanitizes output
 */
export function safeConsoleError(message: string, error?: any): void {
    if (error) {
        console.error(message, sanitizeError(error));
    } else {
        console.error(message);
    }
}

/**
 * Safe console.log that sanitizes output
 */
export function safeConsoleLog(message: string, data?: any): void {
    if (data) {
        console.log(message, sanitizeObject(data));
    } else {
        console.log(message);
    }
}
