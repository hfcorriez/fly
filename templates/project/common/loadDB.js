module.exports = (event, { '/lib/db': db, set }) => {
  set('db', db.create())
  return event
}
