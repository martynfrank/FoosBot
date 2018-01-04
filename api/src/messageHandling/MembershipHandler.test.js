import test from '../test'
import sinon from 'sinon'
import MessageHandler from '.'

const installationsTableName = process.env.installationsTableName = 'installationsTableName'
const matchHistoryTableName = process.env.matchHistoryTableName = 'matchHistoryTableName'
const roomId = 12321
let db, messageHandler, installation, body

function setupHandler () {
  installation = {
    oauthId: 'oauthId',
    oauthSecret: 'oauthSecret',
    rooms: {}
  }
  body = {
    oauth_client_id: 'oauthId',
    item: {
      message: {
        mentions: [],
        from: { name: 'My Name' }
      },
      room: {
        id: roomId
      }
    }
  }
  db = {
    query: sinon.stub().returns({ promise: () => { return { Items: [] } } }),
    update: sinon.stub().returns({ promise: () => {} }),
    put: sinon.stub().returns({ promise: () => {} })
  }
  messageHandler = new MessageHandler(db)
}

test('MembershipHandler # add no-one', async t => {
  setupHandler()
  body.item.message.message = 'add'

  const response = await messageHandler.handle(installation, body)

  t.notCalled(db.update)
  t.textResponse(response, `Who do you want to add?`)
  t.end()
})

test('MembershipHandler # add the first members', async t => {
  setupHandler()
  body.item.message.mentions = [{mention_name: 'anothermember', name: 'Another Member'}]
  body.item.message.message = 'ADD members:Á New Member, @Anothermember and me'

  const response = await messageHandler.handle(installation, body)

  t.callCount(db.update, 2)
  t.calledWithExactly(db.update, {
    TableName: installationsTableName,
    Key: { oauthId: 'oauthId' },
    UpdateExpression: 'SET rooms.#id = :r',
    ConditionExpression: 'attribute_not_exists(rooms.#id)',
    ExpressionAttributeNames: { '#id': body.item.room.id.toString() },
    ExpressionAttributeValues: {
      ':r': {
        members: {}
      }
    }
  })
  t.calledWithExactly(db.update, {
    TableName: installationsTableName,
    Key: { oauthId: 'oauthId' },
    UpdateExpression: 'SET rooms.#id.members.#n0 = :n0, rooms.#id.members.#n1 = :n1, rooms.#id.members.#n2 = :n2',
    ExpressionAttributeNames: {
      '#id': roomId.toString(),
      '#n0': 'a new member',
      '#n1': 'another member',
      '#n2': 'my name'
    },
    ExpressionAttributeValues: {
      ':n0': 'Á New Member',
      ':n1': 'Another Member',
      ':n2': 'My Name'
    }
  })
  t.textResponse(response, `OK, I've added Á New Member, Another Member and My Name to the league.`)
  t.end()
})

test('MembershipHandler # add a new member', async t => {
  setupHandler()
  installation.rooms[roomId] = { members: { someone: 'Someone' } }
  body.item.message.message = 'add New Member'

  const response = await messageHandler.handle(installation, body)

  t.callCount(db.update, 1)
  t.calledWithExactly(db.update, {
    TableName: installationsTableName,
    Key: { oauthId: 'oauthId' },
    UpdateExpression: 'SET rooms.#id.members.#n0 = :n0',
    ExpressionAttributeNames: {
      '#id': roomId.toString(),
      '#n0': 'new member'
    },
    ExpressionAttributeValues: {
      ':n0': 'New Member'
    }
  })
  t.textResponse(response, `OK, I've added New Member to the league.`)
  t.end()
})

test(`MembershipHandler # add accepts duplicate names`, async t => {
  setupHandler()
  installation.rooms[roomId] = { members: { } }
  body.item.message.message = 'add someone , Someone Else,,Someone'

  const response = await messageHandler.handle(installation, body)

  t.callCount(db.update, 1)
  t.calledWithExactly(db.update, {
    TableName: installationsTableName,
    Key: { oauthId: 'oauthId' },
    UpdateExpression: 'SET rooms.#id.members.#n0 = :n0, rooms.#id.members.#n1 = :n1',
    ExpressionAttributeNames: {
      '#id': roomId.toString(),
      '#n0': 'someone',
      '#n1': 'someone else'
    },
    ExpressionAttributeValues: {
      ':n0': 'Someone',
      ':n1': 'Someone Else'
    }
  })
  t.textResponse(response, `OK, I've added Someone and Someone Else to the league.`)
  t.end()
})

test('MembershipHandler # remove existing and non-existent members', async t => {
  setupHandler()
  installation.rooms[roomId] = { members: { someone: 'Someone' } }
  body.item.message.mentions = [{mention_name: 'someone', name: 'SómeOne'}, {mention_name: 'SomeoneElse', name: 'Someone Else'}]
  body.item.message.message = 'Remove @someone @someoneelse'

  const response = await messageHandler.handle(installation, body)

  t.notCalled(db.update)
  t.textResponse(response, `Sorry, I don't know how to remove competitors from the league yet. Why would anyone want to stop playing foosball anyway?`)
  t.end()
})

test('MembershipHandler # list all members', async t => {
  setupHandler()
  installation.rooms[roomId] = { members: { '<xss>': '<XSS>', a: 'A', b: 'B' } }
  body.item.message.message = 'LIST'
  const dbMatches = {
    Items: [
      { id: 'match#1', teams: [['<xss>'], ['a']], scores: [10, 0] },
      { id: 'match#1', teams: [['<xss>'], ['a']], scores: [10, 0] },
      { id: 'match#2', teams: [['<xss>'], ['a']] }
    ]
  }
  db.query.withArgs(sinon.match({ TableName: matchHistoryTableName })).returns({ promise: () => dbMatches })

  const response = await messageHandler.handle(installation, body)

  t.notCalled(db.update)
  t.htmlResponse(response, `Table football leaderboard, sorted by skill level: <ol><li>&lt;XSS&gt; (11.7) 🔥🔥</li><li>B (0.0)</li><li>A (-0.8) 💩💩</li></ol>`)
  t.end()
})

test('MembershipHandler # list members for an empty room', async t => {
  setupHandler()
  installation.rooms[roomId] = { members: { } }
  body.item.message.message = 'List members'

  const response = await messageHandler.handle(installation, body)

  t.notCalled(db.update)
  t.textResponse(response, `There is no foosball league running in this room!`)
  t.end()
})

test('MembershipHandler # list members for an unknown room', async t => {
  setupHandler()
  body.item.message.message = 'list'

  const response = await messageHandler.handle(installation, body)

  t.notCalled(db.update)
  t.textResponse(response, `There is no foosball league running in this room!`)
  t.end()
})
