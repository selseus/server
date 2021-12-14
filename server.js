/*
  - All requests to server are handled starting here
  - The Accounts object takes DB URL, DB name & collection name and 
    exposes login, signup and delete methods (Refer db.js for more info)
*/

require('dotenv').config();

var express = require('express')
var bodyParser = require('body-parser')
var CryptoJS = require('crypto-js')
const { createServer } = require('http');
const { Server } = require('socket.io');
// var path = require('path');
const Accounts = require('./assets/db')
const Attendance = require('./assets/attendance')
const port = 3100;

var accounts = new Accounts()
var app = express()

const encrypt = (text) => { return JSON.stringify({ cipher: CryptoJS.AES.encrypt(JSON.stringify(text), process.env.KEY).toString() }) }
const decrypt = (cipher) => { return JSON.parse(CryptoJS.AES.decrypt(cipher, process.env.KEY).toString(CryptoJS.enc.Utf8)) }
// app.get('/accounts', function (req, res) {
//   res.status(404).json('TempScan server')
// })

// app.use(express.static('assets'))
// app.get('*', function (req, res) {
//   res.status(404).sendFile(path.join(__dirname, './index.html'));
// })

app.use(bodyParser.urlencoded({ extended: true }));
// the limit here is taking into consideration the max file size for a profile photo
// if limit is set to 200 MB, a profile photo of max size 199.9 MB can be comfortably uploaded
app.use(bodyParser.json({ limit: '200mb' }));

// Security middleware. Checks both POST request auth token and decrypts cipher
app.use(function (req, res, next) {
  if (req.headers.authorization === `Bearer ${process.env.AUTH_TOKEN}`) {
    try {
      req.body = decrypt(req.body.cipher)
      next()
    } catch {
      res.status(403).json('This request might have been tampered with or have been subject to a man-in-the-middle attack.')
    }
  }
  else res.status(403).json('Authorization error. Please pass the correct auth token along with requests...')
})

app.post('/attendance/mark', async function (req, res) {
  try {
    var attendance = new Attendance(req.body.uid)
    res.status(200).end(encrypt(await attendance.mark_attendance(req.body)))
  } catch (e) { res.status(400).end(encrypt({ "result": false, error: e.message })) }
})

app.post('/attendance/refresh', async function (req, res) {
  try {
    var attendance = new Attendance(req.body.uid)
    res.status(200).end(encrypt(await attendance.refresh()))
  } catch (e) { res.status(400).end(encrypt(e.message)) }
})

// Account related actions

app.post('/accounts/login', async function (req, res) {
  try {
    res.status(200).end(encrypt(await accounts.login(req.body.uid)))
  } catch {
    res.status(400).end(encrypt({ "user_info": "An unknown error occured", "error": true }))
  }
})

app.post('/accounts/signup', async function (req, res) {
  try {
    res.status(200).end(encrypt(await accounts.signup(req.body)))
  } catch(e) {
    console.log(e.message)
    res.status(400).end(encrypt({ "user_info": "An unknown error occured", "error": true }))
  }
})

app.post('/accounts/update', async function (req, res) {
  try {
    res.status(200).end(encrypt(await accounts.update(req.body)))
  } catch {
    res.status(400).end(encrypt(false))
  }
})

app.post('/accounts/removedp', async function (req, res) {
  try {
    res.status(200).end(encrypt(await accounts.remove_dp(req.body.uid)))
  } catch { res.status(400).end(encrypt(false)) }
})

app.post('/accounts/updateph', async function (req, res) {
  try {
    res.status(200).end(encrypt(await accounts.update_phone(req.body)))
  } catch (e) { res.status(400).end(encrypt({ "user_info": false, "error": e.message })) }
})

const httpServer = createServer(app);
const io = new Server(httpServer);
io.on("connection", (socket) => {
  socket.on('mark', async (message) => {
    var data;
    try {
      data = decrypt(JSON.parse(message).cipher)
      var attendance = new Attendance(data.uid)
      attendance = await attendance.mark_attendance(data)
      io.emit('marked_client', encrypt(attendance))
      io.emit('marked_terminal', encrypt({ user: await accounts.user_info(attendance.uid), temperature: attendance.temperature, date: attendance.date, time: attendance.time, terminal: attendance.terminal }))
    } catch (e) {
      try {
        io.emit(e.message === 'duplicate' ? 'duplicate' : 'failed', encrypt({ uid: data.uid, terminal: data.terminal }))
      } catch (e) {
        console.log(e.message);
        // At this point, someone maybe connected to the socket but isn't authorized
        // Right now, there's no need to panic as they still have the encryption to break
      }
    }
  })
});

httpServer.listen(port, () => {
  console.log(`Server is running at ${port}`);
})