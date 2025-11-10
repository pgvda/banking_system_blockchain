const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function registerUser(userId, userSecret) {
    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
    const ca = new FabricCAServices(caInfo.url);

    const wallet = await Wallets.newFileSystemWallet('./wallet');

    // Check if user already exists
    const userExists = await wallet.get(userId);
    if (userExists) {
        console.log(`An identity for the user ${userId} already exists in the wallet`);
        return;
    }

    // Check for admin identity
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
        console.log('Admin identity not found in wallet. Enroll admin first.');
        return;
    }

    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // Register user
    const secret = await ca.register({
        affiliation: 'org1.department1',
        enrollmentID: userId,
        role: 'client'
    }, adminUser);

    // ✅ Enroll user
    const userEnrollment = await ca.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret
    });

    const x509Identity = {
        credentials: {
            certificate: userEnrollment.certificate,
            privateKey: userEnrollment.key.toBytes()
        },
        mspId: 'Org1MSP',
        type: 'X.509'
    };

    await wallet.put(userId, x509Identity);

    console.log(`User ${userId} registered and enrolled successfully`);
    return {userId,secret };
}

module.exports = { registerUser };
