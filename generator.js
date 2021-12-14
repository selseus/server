/*
    - A simple script to generate an encrypted cipher from a given string
    - Use this to generate QR stickers for users
    - Run as npm run-script generate
    - Go to https://www.the-qrcode-generator.com/ and paste the output from this script
*/

require('dotenv').config();
const readline = require('readline');
var CryptoJS = require('crypto-js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const def = { temperature: 39.5, date: '4th November, 2021', object: '2019-01-25T02:00:00.000Z', time: '08:30 AM', terminal: 'gate' }

rl.question('\nEnter a JSON string to convert to server format\n(default)>>> ', function (string) {
    !string ? console.log(`\nThe default request object is:\n${CryptoJS.AES.encrypt(JSON.stringify(def), process.env.TERMINAL_KEY).toString()}`) : console.log(`\nRequest object generated is: ${CryptoJS.AES.encrypt(JSON.stringify(string), process.env.KEY).toString()}`)
    rl.close()
})

rl.on('close', function () {
    process.exit(0);
})