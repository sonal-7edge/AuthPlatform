require('dotenv').config()

const compression = require('compression')
const cors = require('cors')
const express = require('express')
// const cluster = require('node:cluster')
// const numCPUs = require('node:os').availableParallelism()
const zlib = require('zlib')

const port = process.env.PORT || 8000

const routes = require('./app')

// Check if we should use clustering based on PM2's environment
// PM2 will run in cluster mode, so we shouldn't use Node's built-in clustering
// const isPM2 = 'PM2_HOME' in process.env || process.env.NODE_ENV === 'production'

// Function to create and set up the Express app
const createApp = () => {
    const app = express()

    /** ECS Health check Endpoint */
    app.get('/', (req, res) => {
        // console.log('Middle:', req.user)

        res.status(200).json({
            status: 'OK',
            message: 'Admin backend is running',
        })
    })

    app.use(express.urlencoded({ extended: true }))
    app.use(cors())
    app.use(express.json())
    app.use(compression({
        brotli: {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
            },
        },
    }))
    app.use(routes)

    return app
}

// Function to start the server
const startServer = async () => {
    try {

        const app = createApp()
        app.listen(port, () => {
            console.log(`Worker ${process.pid} listening on http://localhost:${port}`)
        })
        console.log(`Worker ${process.pid} started`)
    } catch (error) {
        console.error(error)
        process.exit(1) // Exit process with failure
    }
}

startServer()
// If we're using PM2 or this is a worker thread, start the server directly
// if (isPM2 || !cluster.isPrimary) {
//     startServer()
// } else {
// If this is the primary thread and we're not using PM2, fork workers
// console.log(`Primary ${process.pid} is running`)
// console.log(`Forking ${numCPUs} workers...`)

// Fork workers
// for (let i = 0; i < numCPUs; i += 1) {
//     cluster.fork()
// }

// Handle worker deaths and restart them
// cluster.on('exit', (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`)
//     console.log('Starting a new worker')
//     cluster.fork()
// })
// }
