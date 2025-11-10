const { enrollAdmin, registerUser, listWallet, loginUser, getWalletService, approve } = require('../services/caService');

async function enrollAdminController(req, res) {
    try {
        const { org } = req.body;
        if (!org) return res.status(400).json({ error: 'org required (e.g. org1)' });
        const result = await enrollAdmin(org);
        res.json(result);
    } catch (err) {
        console.error('enrollAdmin error:', err);
        res.status(500).json({ error: err.message });
    }
}

async function registerUserController(req, res) {
    try {
        const { org, userId, role, affiliation, aesKey } = req.body;
        if (!org || !userId || !role) return res.status(400).json({ error: 'org, userId and role are required' });
        const result = await registerUser({ org, userId, role, affiliation, aesKey });
        res.json(result);
    } catch (err) {
        console.error('registerUser error:', err);
        res.status(500).json({ error: err.message });
    }
}

async function listWalletController(req, res) {
    try {
        const org = req.params.org;
        const identities = await listWallet(org);
        res.json({ identities });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function logingUserController(req, res) {
    try {
        const {org, userId, aesKey} = req.body;
        console.log(org)
        const message = await loginUser(org, userId, aesKey);
        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getWalletController(req, res) {
    try {
        const {org, userId} = req.body;
        console.log('get org')
        const message = await getWalletService(org, userId);
        console.log(message)
        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
async function aprroveController(req, res) {
    try {
        const {approvalData, signature, certificate, aesKey} = req.body;
        console.log('get org')
        const message = await approve(approvalData, signature, certificate, aesKey);
        console.log(message)
        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { enrollAdminController, registerUserController, listWalletController, logingUserController, getWalletController, aprroveController};
