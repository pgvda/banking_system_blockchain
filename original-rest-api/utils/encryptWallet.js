const crypto = require('crypto');
const config = require('../config/config')

const { secret_key, secret_iv, ecnryption_method } = config;

const key = crypto
    .createHash('sha512')
    .update(secret_key)
    .digest('hex')
    .substring(0, 32)
const encryptionIV = crypto
    .createHash('sha512')
    .update(secret_iv)
    .digest('hex')
    .substring(0, 16)


exports.encryptWallet = (data, aesKey) => {
    const cipher = crypto.createCipheriv(ecnryption_method, key, encryptionIV)
    return Buffer.from(
        cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
    ).toString('base64')
}

exports.decryptWallet = (encryptedWallet, aesKey) => {
    const buff = Buffer.from(encryptedWallet, 'base64')
    const decipher = crypto.createDecipheriv(ecnryption_method, key, encryptionIV)
    return (
        decipher.update(buff.toString('utf8'), 'hex', 'utf8') +
        decipher.final('utf8')
    )
}