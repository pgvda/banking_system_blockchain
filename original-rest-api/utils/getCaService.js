const fs = require('fs');
const path = require('path');
const FabricCAServices = require('fabric-ca-client');
const { Gateway } = require('fabric-network');

const FABRIC_SAMPLES_PATH = process.env.FABRIC_SAMPLES_PATH || "/home/vidusha/fabric-samples/test-network";

function getConnectionProfile(orgShortName) {
    console.log('path',FABRIC_SAMPLES_PATH);
    const ccpPath = path.join(FABRIC_SAMPLES_PATH, 'organizations', 'peerOrganizations', `${orgShortName}.example.com`, `connection-${orgShortName}.json`);
    if (!fs.existsSync(ccpPath)) throw new Error(`Connection profile missing: ${ccpPath}`);
    console.log(JSON.parse(fs.readFileSync(ccpPath, 'utf8')))
    return JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
}

async function getCaService(orgShortName) {
    const ccp = getConnectionProfile(orgShortName);
    const caKey = Object.keys(ccp.certificateAuthorities)[0];
    const caInfo = ccp.certificateAuthorities[caKey];
    const url = caInfo.url;
    const caName = caInfo.caName || caKey;
    const tlsCACerts = caInfo.tlsCACerts && caInfo.tlsCACerts.pem ? caInfo.tlsCACerts.pem : undefined;
    return new FabricCAServices(url, { trustedRoots: tlsCACerts, verify: false }, caName);
}

async function confirmValidity(wallet, orgShortName, userId, chaincodeFunction) {
    const ccp = getConnectionProfile(orgShortName);
    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity:userId,
        discovery: {enabled:true, asLocalhost:true}
    })

    const network = await gateway.getNetwork('mifinance');
    const contract = network.getContract('basic');

    const result = await contract.evaluateTransaction(chaincodeFunction);
    console.log(result);

    console.log(`User login verified: ${result.toString()}`);

    await gateway.disconnect();

    return { success: true, message: result.toString() };
}

function getOrgMSP(orgShortName) {
  if (orgShortName.toLowerCase() === "org1") return "Org1MSP";
  if (orgShortName.toLowerCase() === "org2") return "Org2MSP";
  throw new Error(`Unknown org: ${orgShortName}`);
}


module.exports = { getCaService, confirmValidity, getOrgMSP };
