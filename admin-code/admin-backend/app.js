const express = require('express')

const healthRoutes = require('./routes/health')

const router = express.Router()

router.use('/health', healthRoutes)

module.exports = router
