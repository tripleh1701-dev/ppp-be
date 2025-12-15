import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16 bytes
const SALT_LENGTH = 32; // Salt length for key derivation

export interface EncryptedToken {
    encrypted: string;
    iv: string;
    salt: string;
    timestamp: string;
}

export interface DecryptedToken {
    token: string;
    timestamp: string;
}

/**
 * Gets the encryption key from environment variables
 * Derives a proper key using PBKDF2 with the provided salt
 */
function getEncryptionKey(salt: Buffer): Buffer {
    const masterKey = process.env.TOKEN_ENCRYPTION_KEY || process.env.PASSWORD_ENCRYPTION_KEY;
    if (!masterKey) {
        throw new Error('TOKEN_ENCRYPTION_KEY or PASSWORD_ENCRYPTION_KEY environment variable is required');
    }
    
    if (masterKey.length < 32) {
        throw new Error('Encryption key must be at least 32 characters long');
    }
    
    // Use PBKDF2 to derive a proper encryption key
    return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts a token using AES-256-CBC
 * Returns encrypted data with metadata for secure storage
 */
export function encryptToken(token: string): EncryptedToken {
    try {
        if (!token) {
            throw new Error('Token cannot be empty');
        }

        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);
        
        // Derive encryption key
        const key = getEncryptionKey(salt);
        
        // Create cipher with proper modern API
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        // Encrypt the token
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const result: EncryptedToken = {
            encrypted,
            iv: iv.toString('hex'),
            salt: salt.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
        console.log('🔐 Token encrypted successfully');
        return result;
        
    } catch (error) {
        console.error('❌ Token encryption failed:', error);
        throw new Error('Failed to encrypt token');
    }
}

/**
 * Decrypts a token using AES-256-CBC
 */
export function decryptToken(encryptedData: EncryptedToken): DecryptedToken {
    try {
        if (!encryptedData || !encryptedData.encrypted) {
            throw new Error('Invalid encrypted token data');
        }

        const { encrypted, iv, salt, timestamp } = encryptedData;
        
        // Convert hex strings back to buffers
        const ivBuffer = Buffer.from(iv, 'hex');
        const saltBuffer = Buffer.from(salt, 'hex');
        
        // Derive the same encryption key
        const key = getEncryptionKey(saltBuffer);
        
        // Create decipher with proper modern API
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        
        // Decrypt the token
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('🔓 Token decrypted successfully');
        
        return {
            token: decrypted,
            timestamp
        };
        
    } catch (error) {
        console.error('❌ Token decryption failed:', error);
        throw new Error('Failed to decrypt token');
    }
}

/**
 * Validates if encrypted token data is properly formatted
 */
export function isValidEncryptedToken(data: any): data is EncryptedToken {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.encrypted === 'string' &&
        typeof data.iv === 'string' &&
        typeof data.salt === 'string' &&
        typeof data.timestamp === 'string'
    );
}

