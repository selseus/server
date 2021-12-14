const { MongoClient } = require('mongodb')

class Attendance {
    constructor(uid) {
        this.client = new MongoClient(process.env.MONGO_URL)
        this.db = this.client.db('attendance')
        this.collection = uid
    }
    async add_user() {
        try {
            await this.client.connect()
            await this.db.createCollection(this.collection)
            await this.client.close()
        } catch { }
    }
    async refresh() {
        try {
            await this.client.connect()
            const result = await this.db.collection(this.collection).find({}).toArray()
            await this.client.close()
            return { "result": result, "error": false }
        } catch (e) { throw Error(e.message) }
    }
    async mark_attendance(info) {
        try {
            await this.client.connect()
            const attendance = await this.db.collection(this.collection).find({}).toArray()
            var dates = [];
            for (const each of attendance) dates.push(each.date)
            // const dates = await this.db.collection(this.collection).find({}, { date: 1, _id: 0 }).toArray()
            if (!dates.includes(info.date)) {
                this.db.collection(this.collection).insertOne({ temperature: info.temperature, date: info.date, time: info.time, object: info.object, terminal: info.terminal }, () => this.client.close())
                return { uid: info.uid, terminal: info.terminal, temperature: info.temperature, date: info.date, time: info.time, object: info.object }
            } else throw Error('duplicate')
        } catch (e) {
            throw Error(e.message === 'duplicate' ? 'duplicate' : 'An unknown error occured and we were unable to mark your attendance. Please contact administrator immediately.')
        }
    }
}

module.exports = Attendance