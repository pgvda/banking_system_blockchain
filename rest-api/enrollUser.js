const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function enrollUser(data) {
    const { enrollmentID, enrollmentSecret } = data;

    console.log(data);

    const ccpPath = path.resolve(__dirname, 'connection-org1.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const identity = await wallet.get(enrollmentID);

    if (identity) {
        console.log('User identity already exists');
        return;
    }

    // const adminIdentity = await wallet.get('admin');
    // if (!adminIdentity) {
    // throw new Error('Admin identity not found');
    //  }

    // const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    // const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    //  await ca.register({
    //     enrollmentID: enrollmentID,
    //     enrollmentSecret: enrollmentSecret,
    //     role: 'client'
    // }, adminUser);

    const userEnrollment = await ca.enroll({
        enrollmentID,
        enrollmentSecret
    });

    const x509Identity = {
    credentials: {
      certificate: userEnrollment.certificate,
      privateKey: userEnrollment.key.toBytes(),
    },
    mspId: 'Org1MSP',
    type: 'X.509',
  };

  await wallet.put(enrollmentID, x509Identity);

    
    console.log('User enrolled successfully');
    return {code:200, msg:'success'}
}

module.exports = { enrollUser };
