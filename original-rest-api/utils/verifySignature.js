const crypto = require('crypto');

function verifySignature(certPEM, payload, signatureDERBase64) {
  console.log('signaueredfvdv', signatureDERBase64)
  const cert = new crypto.X509Certificate(certPEM);
  const publicKey = cert.publicKey;

  const digestBytes = Buffer.from(payload, 'base64');


  const signatureDER = Buffer.from(signatureDERBase64, 'base64');

  console.log('payloadBytes', digestBytes)
  console.log('payloadBytes', digestBytes.byteLength)

  const valid = crypto.verify(
    null,
    digestBytes,
    {
      key: publicKey,
      format: 'pem',
      type: 'spki'
    },
    signatureDER
  );

  return valid;
}




module.exports = { verifySignature };
