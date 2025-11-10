const express = require('express');
const { enrollAdminController, registerUserController, listWalletController, logingUserController, getWalletController, aprroveController } = require('../controller/caController');

const router = express.Router();

router.post('/enrollAdmin', enrollAdminController);
router.post('/registerUser', registerUserController);
router.get('/wallet/:org/list', listWalletController);
router.post('/login', logingUserController);
router.post('/getWallet', getWalletController);
router.post('/approve', aprroveController);

module.exports = router;
