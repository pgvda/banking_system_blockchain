const fsExtra = require('fs-extra');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const { getCaService, confirmValidity, getOrgMSP } = require('../utils/getCaService');
const jwt = require("jsonwebtoken");
const encryptWallet = require('../utils/encryptWallet');
const { type } = require('os');
const { X509 } = require('jsrsasign');
const { verifySignature } = require('../utils/verifySignature');
const SECRET = "supersecret"; // want to add env file later

async function getWallet(orgShortName) {
    const walletPath = path.join(process.cwd(), 'wallet', `${orgShortName}.example.com`);
    await fsExtra.ensureDir(walletPath);
    return Wallets.newFileSystemWallet(walletPath);
}

async function enrollAdmin(org) {
    const ca = await getCaService(org);
    const wallet = await getWallet(org);
    const adminId = 'admin';
    const adminIdentity = await wallet.get(adminId);
    if (adminIdentity) return { message: `Admin identity already enrolled in wallet for ${org}` };

    const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });

    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes()
        },
        mspId: `${org}MSP`,
        type: 'X.509'
    };

    await wallet.put(adminId, x509Identity);
    return {code:200, message: `Successfully enrolled CA admin for ${org}` };
}

async function registerUser({ org, userId, role, affiliation, aesKey }) {
    const ca = await getCaService(org);
    const wallet = await getWallet(org);

    const adminId = 'admin';
    const adminIdentity = await wallet.get(adminId);
    if (!adminIdentity) throw new Error(`CA admin not found for ${org}. Call enrollAdmin first.`);

    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, adminId);

    const secret = await ca.register({
        enrollmentID: userId,
        role: 'client',
        affiliation: affiliation || `${org}.department1`,
        attrs: [{ name: 'role', value: role, ecert: true }]
    }, adminUser);

    const enrollment = await ca.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret
    });

    const orgMspValue = await getOrgMSP(org);

    const x509Identity = {
        credentials: {
            certificate: encryptWallet.encryptWallet(enrollment.certificate, aesKey),
            privateKey: enrollment.key.toBytes()
        },
        mspId: orgMspValue,
        type: 'X.509'
    };

    const encrptedUserId = encryptWallet.encryptWallet(userId);


    await wallet.put(userId, x509Identity);
    return {code:200, message: `User ${userId} registered and enrolled in ${org}`, enrollmentSecret: secret };
}

async function listWallet(org) {
    const wallet = await getWallet(org);
    return wallet.list ? await wallet.list() : [];
}

async function loginUser(org, userId, aesKey) {
    try {
        const wallet = await getWallet(org);
        const identity = await wallet.get(userId);

        if (!identity) {
            throw new Error(`User ${userId} not found in wallet. Please register first.`);
        }

        const decryptedCert = encryptWallet.decryptWallet(identity.credentials.certificate, aesKey);


        const tempWallet = await Wallets.newInMemoryWallet();
        await tempWallet.put(userId, {
            credentials: {
                certificate: decryptedCert,
                privateKey: identity.credentials.privateKey
            },
            mspId: identity.mspId,
            type: identity.type
        });
        console.log('wallet',decryptedCert)
        const validity = await confirmValidity(tempWallet, org, userId, 'AuthenticateUser');
        console.log('validation', validity)
        const roleMatch = validity.message.match(/role=(\w+)/);
        const role = roleMatch ? roleMatch[1] : 'unknown';
        console.log('role:', role);

        const token = jwt.sign(
            {
                userId,
                org,
                mspId: identity.mspId,
                role
            },
            SECRET,
            { expiresIn: "2h" }
        );

        return {code:200, message: `Login successful for ${userId}`, token };
    } catch (err) {
        console.log(err.message);
        throw Error(err);
    }
}

async function getWalletService(org, userId) {
    try {
        const wallet = await getWallet(org);
        const identity = await wallet.get(userId);

        if (!identity) {
            throw new Error(`Identity for user ${userId} not found in ${org}`);
        }

        const encryptedPayloadB64 = Buffer.from(identity.credentials.privateKey).toString("base64");
        const plainText = identity.credentials.privateKey
        return { encryptedPayloadB64 };
    } catch (error) {
        console.error(error);
        throw Error(error);
    }
}

async function approve(approvalDigest, payload, userId, signatureB64, aesKey, org) {
  try {
    console.log(
      "approvalDigest:", approvalDigest,
      "userId:", userId,
      "signatureB64:", signatureB64,
      "aesKey:", aesKey,
      "org:", org,
      "payload:", payload
    );

    if (!approvalDigest || !signatureB64 || !aesKey) {
      return { code: 402, message: "approvalDigest, signature, and aesKey are required" };
    }

    const wallet = await getWallet(org);
    const identity = await wallet.get(userId);

    if (!identity) {
      throw new Error(`User ${userId} not found in wallet. Please register first.`);
    }

    // Decrypt certificate
    const decryptedCert = encryptWallet.decryptWallet(identity.credentials.certificate, aesKey);

    console.log("Signature verification failed!", decryptedCert);
    
    const valid = verifySignature(decryptedCert, approvalDigest, signatureB64);

    if (!valid) {
      console.log("Signature verification failed!");
      return { code: 402, message: "Invalid signature" };
    }

    console.log("Signature verified successfully.");


    const tempWallet = await Wallets.newInMemoryWallet();
    await tempWallet.put(userId, {
      credentials: {
        certificate: decryptedCert,
        privateKey: identity.credentials.privateKey,
      },
      mspId: identity.mspId,
      type: identity.type,
    });

    
    const validity = await confirmValidity(tempWallet, org, userId, "AuthenticateUser");
    console.log("Validity check result:", validity);

    const roleMatch = validity.message?.match(/role=(\w+)/);
    const role = roleMatch ? roleMatch[1] : "unknown";

    return { code: 200, message: "verified", role: role };
  } catch (error) {
    console.error("Error in approve:", error);
    throw new Error(error);
  }
}



module.exports = { enrollAdmin, registerUser, listWallet, loginUser, getWalletService, approve };
