exports.verifySignature = (certificatePEM, messageJSON, signatureB64) => {
    const verifier = crypto.createVerify('sha256');
    verifier.update(JSON.stringify(messageJSON));
    verifier.end();
    const sigBuf = Buffer.from(signatureB64, 'base64');

    // Extract public key from certificate
    const cert = crypto.X509Certificate ? new crypto.X509Certificate(certificatePEM) : null;
    const publicKey = cert ? cert.publicKey : certificatePEM; // fallback
    return verifier.verify(publicKey, sigBuf);
}