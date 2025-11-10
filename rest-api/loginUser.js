const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const ccpPath = path.resolve(__dirname, 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

async function loginUser(userId) {
    try {
        const wallet = await Wallets.newFileSystemWallet('./wallet');
        
        //const stringUserId = toString(userId);
        console.log('user id type',typeof(stringUserId))
        // Check if identity exists
        const identity = await wallet.get(userId);
         console.log(identity,"userid",userId)
        if (!identity) {
            return { success: false, message: `No identity found for ${userId}` };
        }
       
        // Optional: Connect to gateway to confirm validity
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: userId,
            discovery: { enabled: true, asLocalhost: true }
        });

        // You can get user info here, e.g. MSP, etc.
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('basic');

        // Call a simple chaincode function to verify login
        const result = await contract.evaluateTransaction('AuthenticateUser');
        console.log(`User login verified: ${result.toString()}`);

        await gateway.disconnect();

        return { success: true, message: result.toString() };
    } catch (error) {
        console.error(`Login failed: ${error}`);
        return { success: false, message: error.message };
    }
}

module.exports = loginUser