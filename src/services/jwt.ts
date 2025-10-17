import jwt, {SignOptions} from 'jsonwebtoken';

// Get JWT secret from environment or use a default for development
// IMPORTANT: In production, always set a strong JWT_SECRET environment variable
const JWT_SECRET =
    process.env.JWT_SECRET ||
    'CHANGE_THIS_IN_PRODUCTION_VERY_IMPORTANT_SECRET_KEY_12345';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h'; // Token expires in 24 hours

export interface JWTPayload {
    userId: string;
    email: string;
    name: string;
    role: string;
    iat?: number;
    exp?: number;
}

export class JWTService {
    /**
     * Generate a JWT token for a user
     */
    static generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
        if (
            JWT_SECRET ===
            'CHANGE_THIS_IN_PRODUCTION_VERY_IMPORTANT_SECRET_KEY_12345'
        ) {
            console.warn(
                '⚠️  WARNING: Using default JWT secret. Set JWT_SECRET environment variable in production!',
            );
        }

        // @ts-ignore - TypeScript has issues with expiresIn type, but JWT accepts string values like '24h'
        return jwt.sign(payload as object, JWT_SECRET, {
            expiresIn: JWT_EXPIRY,
            issuer: 'devops-automate',
            audience: 'devops-automate-users',
        });
    }

    /**
     * Verify and decode a JWT token
     */
    static verifyToken(token: string): JWTPayload | null {
        try {
            const decoded = jwt.verify(token, JWT_SECRET, {
                issuer: 'devops-automate',
                audience: 'devops-automate-users',
            }) as JWTPayload;

            return decoded;
        } catch (error) {
            // Token is invalid or expired
            return null;
        }
    }

    /**
     * Decode token without verification (use for debugging only)
     */
    static decodeToken(token: string): JWTPayload | null {
        try {
            return jwt.decode(token) as JWTPayload;
        } catch (error) {
            return null;
        }
    }

    /**
     * Refresh a token (generate a new one with the same payload)
     */
    static refreshToken(token: string): string | null {
        const payload = this.verifyToken(token);
        if (!payload) {
            return null;
        }

        // Remove iat and exp from payload before generating new token
        const {iat, exp, ...cleanPayload} = payload;
        return this.generateToken(cleanPayload);
    }
}
