require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const caRoutes = require('./routes/caRoutes');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/ca', caRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Fabric CA REST helper listening on port ${PORT}`);
});
