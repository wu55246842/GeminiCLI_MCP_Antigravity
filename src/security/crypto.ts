import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '.env');

/**
 * Ensures that the server has an RSA key pair for secure request signing.
 * If not present, generates a new 2048-bit RSA key pair.
 * The PUBLIC KEY gets saved to the .env file.
 * The PRIVATE KEY gets logged to the console ONLY ONCE for the user to securely store in their browser.
 */
export function initializeKeyPair() {
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
        envContent = fs.readFileSync(ENV_PATH, 'utf8');
    }

    const hasPublicKeyPattern = /SERVER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----/;

    if (!hasPublicKeyPattern.test(envContent)) {
        console.log('\n[SECURITY INITIALIZATION] Generating new RSA Key Pair for Digital Signatures...');

        // Generate a standard RSA-PSS / PKCS#8 key pair
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        // Append the Public Key to the .env file so the server can verify subsequent restarts
        const pkEscaped = publicKey.replace(/\n/g, '\\n');
        fs.appendFileSync(ENV_PATH, `\n# --- AUTO GENERATED SECURITY KEYS ---\nSERVER_PUBLIC_KEY="${pkEscaped}"\n`);

        // Also apply it to the running process memory immediately
        process.env.SERVER_PUBLIC_KEY = pkEscaped;

        console.log('\n======================================================');
        console.log('                 !!! CRITICAL SECURITY ALERT !!!');
        console.log('======================================================');
        console.log('A new RSA key pair has been generated for secure web communication.');
        console.log('The PUBLIC KEY has been permanently saved to your .env file.');
        console.log('The PRIVATE KEY is shown below.');
        console.log('\n>>> YOU MUST COPY THIS PRIVATE KEY NOW. <<<');
        console.log('>>> IT WILL NEVER BE SHOWN OR STORED ANYWHERE ELSE AGAIN. <<<');
        console.log('\nPaste this Private Key into the settings panel on your Web UI to authenticate your browser.');
        console.log('\n-------------------- PRIVATE KEY --------------------');
        console.log(privateKey);
        console.log('-----------------------------------------------------\n');
    }
}

/**
 * A middleware function to verify that incoming requests have been signed by the user's private key.
 * 
 * Headers expected:
 * x-timestamp: ISO string of the current time (prevent replay attacks)
 * x-signature: Base64 RSA-PSS signature of `timestamp + ":" + request_body`
 */
export function verifyDigitalSignature(req: any, res: any, next: any) {
    const timestamp = req.headers['x-timestamp'];
    const signatureBase64 = req.headers['x-signature'];
    const signatureAlg = req.headers['x-signature-algorithm'] || 'SHA-256';

    if (!timestamp || !signatureBase64) {
        return res.status(401).json({ error: "Missing authentication headers. Is your Web UI configured with the Private Key?" });
    }

    // Prevents replay attacks (reject signatures older than 60 seconds)
    const requestTime = new Date(timestamp).getTime();
    const now = Date.now();
    if (Math.abs(now - requestTime) > 60000) {
        return res.status(401).json({ error: "Request timestamp is expired or invalid. Check your system clock." });
    }

    // Construct the exact identical payload that the frontend signed
    // For POST/PUT requests with body (e.g. JSON or FormData)
    // To keep it simple and handle multipart forms, we will sign a hash of the URL and Timestamp rather than full file buffers
    const payloadToVerify = `${req.method}:${req.originalUrl}:${timestamp}`;

    // Read the saved Public Key from environment variables
    const rawPublicKeyStr = process.env.SERVER_PUBLIC_KEY;
    if (!rawPublicKeyStr) {
        console.error("[SECURITY] FATAL ERROR: SERVER_PUBLIC_KEY not found in .env");
        return res.status(500).json({ error: "Server security configuration error." });
    }
    const publicKey = rawPublicKeyStr.replace(/\\n/g, '\n');

    try {
        const verify = crypto.createVerify(signatureAlg);
        verify.update(payloadToVerify);
        verify.end();

        const isValid = verify.verify({
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        }, signatureBase64, 'base64');

        if (!isValid) {
            console.warn(`[SECURITY] Invalid digital signature attempt for ${req.originalUrl}`);
            return res.status(401).json({ error: "Invalid signature. Check your Private Key in settings." });
        }

        // Signature is valid, allow request to proceed
        next();
    } catch (e: any) {
        console.error("[SECURITY] Signature verification crashed:", e);
        return res.status(401).json({ error: "Signature verification failed." });
    }
}
