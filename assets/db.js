const { MongoClient } = require('mongodb')
var admin = require("firebase-admin");
const Attendance = require('./attendance')
const imageToBase64 = require('image-to-base64');

var serviceAccount = require('./service_key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

class Accounts {
    constructor() {
        this.client = new MongoClient(process.env.MONGO_URL)
        this.db = this.client.db('admin')
        this.collection = 'accounts'
    }
    async login(uid) {
        try {
            const record = await admin.auth().getUser(uid)
            await this.client.connect()
            const cursor = await this.db.collection(this.collection).find({ "uid": record.uid })
            let result
            if (await cursor.count() === 0) result = { "user_info": false, "error": true }
            else if (await cursor.count() > 1) result = { "user_info": "You might have multiple accounts", "error": true }
            else {
                var attendance = new Attendance(uid)
                attendance = (await attendance.refresh()).result
                result = await cursor.toArray()
                result = { "user_info": result[0], "attendance": attendance, "error": false }

                // what's up with this if now phew
                // well turns out if someone first signs up using a phone number and then tries google sign in with that same email ID,
                // firebase gets psycho and deletes their already added phone number
                // so now we have to spend extra compute to add that back what a pity
                // as is the case with emails
                if (!record.phoneNumber && result.user_info.phone.length > 0) await admin.auth().updateUser(record.uid, { phoneNumber: result.user_info.phone })
                if (!record.email && result.user_info.email.length > 0) await admin.auth().updateUser(record.uid, { email: result.user_info.email })

                // is the above bug entirely firebase's fault? Well actually no XD. It's ours.
                // Our systems weren't built from the ground up to integrate well with Firebase auth
                // For instance, phone auth can be debugged more to use MFA-like account creation using the verifyPhoneNumber() method at the client side which also requires redesign of server
                // Any PR's are welcome for all of these
            }
            await this.client.close()
            return result
        } catch (e) {
            console.log(e.message)
            if (e.message === "There is no user record corresponding to the provided identifier.") {
                return { "user_info": false, "error": true }
            } else throw Error(e.message)
        }
    }
    async signup(info) {
        try {
            await this.client.connect()
            const cursor = await this.db.collection(this.collection).find({ "roll": info.roll, "stream": info.stream, "batch": info.batch })
            if (await cursor.count() === 0) {
                await admin
                    .auth()
                    .updateUser(info.uid, {
                        email: info.email,
                        phoneNumber: info.phone,
                        password: info.password,
                        displayName: info.name,
                    })
                var object = info;
                object.image = info.image ? info.image : process.env.PROFILE_PIC;
                this.db.collection(this.collection).insertOne(object, () => this.client.close())
                var attendance = new Attendance(info.uid)
                await attendance.add_user()
                return { user_info: object, error: false }
            } else return { user_info: false, error: "This student has already registered. Please contact administrator or staff advisor." }
        } catch (e) {
            try {
                // Imagine someone tried creating an account using a login method once, but didn't complete the singup process
                // Next time, they try with another login method, but then try to sign up by giving in the same details as before.
                // We need to handle this gracefully as this is not at all obvious to the user and they'll think that the server might have crashed
                if (e.message.includes('user with the provided phone number already exists.')) {
                    const user = await admin
                        .auth()
                        .getUserByPhoneNumber(info.phone)
                    if (!user.email) {
                        await admin
                            .auth()
                            .deleteUser(user.uid)
                        return await this.signup(info)
                    } else return { user_info: false, error: 'Someone has already registered with this phone number before, Please try with another number or contact administrator.' }
                } else if (e.message.includes('email address is already in use by another account')) {
                    const user = await admin
                        .auth()
                        .getUserByEmail(info.email)
                    if (!user.phoneNumber) {
                        await admin
                            .auth()
                            .deleteUser(info.uid)
                        let temp_object = info
                        temp_object.uid = user.uid
                        try { temp_object.image = `data:image;base64,${await imageToBase64(user.photoURL)}` } catch { }
                        return await this.signup(temp_object)
                    } else throw Error('Someone has already regsitered with this email before. Please try another one or contact administrator.');
                }
            } catch (e) { throw Error(e.message) }
        }
    }
    async update(info) {
        try {
            await this.client.connect();
            await admin
                .auth()
                .updateUser(info.uid, {
                    email: info.email,
                    phoneNumber: info.phone,
                    password: info.password,
                    displayName: info.displayName,
                })
            await this.db.collection(this.collection).updateOne({ "uid": info.uid }, {
                $set: {
                    uid: info.uid,
                    name: info.name,
                    email: info.email,
                    password: info.password,
                    phone: info.phone,
                    stream: info.stream,
                    batch: info.batch,
                    image: info.image
                }
            })
            await this.client.close()
            return true
        }
        catch (e) {
            console.log(e)
            throw Error
        }
    }
    async update_phone(info) {
        try {
            await this.client.connect();
            let user = await admin
                .auth()
                .getUserByPhoneNumber(info.phone);
            if (!user.email) {
                await admin
                    .auth()
                    .deleteUser(user.uid)
                await admin
                    .auth()
                    .updateUser(info.user, { phoneNumber: info.phone })
                await this.db.collection(this.collection).updateOne({ "uid": info.user }, {
                    $set: {
                        phone: info.phone,
                    }
                })
                const result = await this.db.collection(this.collection).findOne({ "uid": info.user })
                await this.client.close();
                return { "user_info": result, "error": false }
            } else throw Error('This phone number was already taken by someone else. Please try a different one.')
        } catch (e) {
            if (e.code === 'auth/user-not-found') return await this.update_phone(info)
            else throw Error(e.message)
        }
    }
    async remove_dp(uid) {
        try {
            await this.client.connect();
            await this.db.collection(this.collection).updateOne({ "uid": uid }, {
                $set: {
                    image: process.env.PROFILE_PIC
                }
            })
            await this.client.close()
            return true
        } catch { throw Error }
    }
    async user_info(uid) {
        try {
            await this.client.connect();
            const result = await this.db.collection(this.collection).findOne({ "uid": uid })
            await this.client.close();
            return result
        }
        catch (e) {
            console.log(e.message)
            throw Error('Unknown')
        }
    }
}

module.exports = Accounts