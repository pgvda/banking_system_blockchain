const express = require('express');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const { enrollUser } = require('./enrollUser');
const { registerUser } = require('./registerUser');
const loginUser = require('./loginUser');

const app = express();
app.use(cors());
app.use(express.json());

const ccpPath = path.resolve(__dirname, 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

const USER_ID = 'user'; 
const CHANNEL_NAME = 'mychannel';
const CHAINCODE_NAME = 'basic';

app.post('/invoke', async (req, res) => {
  const { fcn, args } = req.body;
  console.log('Invoking function:', fcn, 'with args:', args);
  try {
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const identity = await wallet.get(USER_ID);
    if (!identity) return res.status(400).json({ error: `Identity for "${USER_ID}" not found` });

    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: USER_ID,
      discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);

    const result = await contract.submitTransaction(fcn, ...args);
    await gateway.disconnect();

    res.json({ result: result.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/register', async(req, res) => {
  const data = req.body;

  
  try{
    const { enrollmentID, enrollmentSecret } = data;

    await registerUser(enrollmentID, enrollmentSecret);

    const userData = await enrollUser(data);

    res.status(200).json({code:200, data:userData})
  }catch(err){
    console.error(err);
    res.status(500).json({ error: err.message });
  }
})

app.post('/api/user/login', async(req, res) => {
  const {userId} = req.body
  try{
    const result = await loginUser(userId);
    
    res.status(200).json({code:200, response:result})
  }catch(err){
    res.status(500).json({error: err.message})
  }
})

app.post('/api/user/authentication', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // Load wallet
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const identity = await wallet.get(userId);
    if (!identity) {
      return res.status(401).json({ error: `Identity for "${userId}" not found in wallet` });
    }

    // Connect using user identity
    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: userId,
      discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);

    // Evaluate the chaincode function
    const result = await contract.evaluateTransaction('AuthenticateUser');
    await gateway.disconnect();

    res.status(200).json({
      message: 'Authentication successful',
      identity: result.toString()
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});


app.get('/api/assets/:id', async (req, res) => {
  const assetId = req.params.id;

  if (!assetId) {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  try {
    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const identity = await wallet.get(USER_ID);
    if (!identity) {
      return res.status(401).json({ error: `Identity for "${USER_ID}" not found` });
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: USER_ID,
      discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);

    const result = await contract.evaluateTransaction('GetUser', assetId);
    await gateway.disconnect();

    res.status(200).json({ result: JSON.parse(result.toString()) });
  } catch (error) {
    console.error(`Failed to evaluate transaction: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.listen(4000, () => console.log('API server running on http://localhost:4000'));
