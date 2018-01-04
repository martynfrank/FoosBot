import moment from 'moment'

export default class SaveMatch {
  constructor (db) {
    this._db = db
  }

  async execute (match) {
    match.time = moment().unix()
    match.id = createId()
    await this._db.put({
      TableName: process.env.matchHistoryTableName,
      Item: match
    }).promise()
  }
}

function createId () {
  return moment().format('YYYY-MM-DD') + '#' + Math.floor(Math.random() * 36 ** 4).toString(36)
}
