import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16 bytes
const SALT_LENGTH = 32; // Salt length for key derivation

export interface EncryptedPassword {
    encrypted: string;
    iv: string;
    salt: string;
    timestamp: string;
}

export interface DecryptedPassword {
    password: string;
    timestamp: string;
}

/**
 * Gets the encryption key from environment variables
 * Derives a proper key using PBKDF2 with the provided salt
 */
function getEncryptionKey(salt: Buffer): Buffer {
    const masterKey = process.env.PASSWORD_ENCRYPTION_KEY;
    if (!masterKey) {
        throw new Error('PASSWORD_ENCRYPTION_KEY environment variable is required');
    }
    
    if (masterKey.length < 32) {
        throw new Error('PASSWORD_ENCRYPTION_KEY must be at least 32 characters long');
    }
    
    // Use PBKDF2 to derive a proper encryption key
    return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts a password using AES-256-CBC
 * Returns encrypted data with metadata for secure storage
 */
export function encryptPassword(password: string): EncryptedPassword {
    try {
        if (!password) {
            throw new Error('Password cannot be empty');
        }

        // Generate random salt and IV
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);
        
        // Derive encryption key
        const key = getEncryptionKey(salt);
        
        // Create cipher with proper modern API
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        // Encrypt the password
        let encrypted = cipher.update(password, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const result: EncryptedPassword = {
            encrypted,
            iv: iv.toString('hex'),
            salt: salt.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
        console.log('🔐 Password encrypted successfully');
        return result;
        
    } catch (error) {
        console.error('❌ Password encryption failed:', error);
        throw new Error('Failed to encrypt password');
    }
}

/**
 * Decrypts a password using AES-256-CBC
 */
export function decryptPassword(encryptedData: EncryptedPassword): DecryptedPassword {
    try {
        if (!encryptedData || !encryptedData.encrypted) {
            throw new Error('Invalid encrypted password data');
        }

        const { encrypted, iv, salt, timestamp } = encryptedData;
        
        // Convert hex strings back to buffers
        const ivBuffer = Buffer.from(iv, 'hex');
        const saltBuffer = Buffer.from(salt, 'hex');
        
        // Derive the same encryption key
        const key = getEncryptionKey(saltBuffer);
        
        // Create decipher with proper modern API
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        
        // Decrypt the password
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('🔓 Password decrypted successfully');
        
        return {
            password: decrypted,
            timestamp
        };
        
    } catch (error) {
        console.error('❌ Password decryption failed:', error);
        throw new Error('Failed to decrypt password');
    }
}

/**
 * Validates if encrypted password data is properly formatted
 */
export function isValidEncryptedPassword(data: any): data is EncryptedPassword {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.encrypted === 'string' &&
        typeof data.iv === 'string' &&
        typeof data.salt === 'string' &&
        typeof data.timestamp === 'string'
    );
}

/**
 * Security audit logging for password operations
 */
export function logPasswordOperation(operation: 'encrypt' | 'decrypt', userId: string, success: boolean): void {
    const logData = {
        timestamp: new Date().toISOString(),
        operation,
        userId,
        success,
        ip: 'backend-service', // In real implementation, pass actual IP
        userAgent: 'backend-service'
    };
    
    // Log to console for now - in production, this should go to a secure audit log
    console.log(`🔒 PASSWORD_AUDIT: ${JSON.stringify(logData)}`);
}

/**
 * Utility to check if password encryption is properly configured
 */
export function validatePasswordEncryptionConfig(): boolean {
    try {
        const masterKey = process.env.PASSWORD_ENCRYPTION_KEY;
        if (!masterKey || masterKey.length < 32) {
            console.error('❌ PASSWORD_ENCRYPTION_KEY is not properly configured');
            return false;
        }
        
        // Test encryption/decryption
        const testPassword = 'test-password-123';
        const encrypted = encryptPassword(testPassword);
        const decrypted = decryptPassword(encrypted);
        
        if (decrypted.password !== testPassword) {
            console.error('❌ Password encryption/decryption test failed');
            return false;
        }
        
        console.log('✅ Password encryption configuration is valid');
        return true;
    } catch (error) {
        console.error('❌ Password encryption configuration validation failed:', error);
        return false;
    }
}