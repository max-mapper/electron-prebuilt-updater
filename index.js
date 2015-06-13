'use strict'

const bodyParser = require('body-parser')
const express = require('express')
const request = require('request')

const app = express()
const options = {
  url: 'https://api.github.com/repos/johnmuhl/ballin-octo-computing-machine/releases/latest',
  headers: {
    'User-Agent': 'electron-prebuilt-updater'
  }
}

app.set('port', (process.env.PORT || 5000))
app.use(bodyParser.json())

app.get('/', function (req, res) {
  request(options, function (error, response, body) {
    if (error) throw error
    let data = JSON.parse(body)
    if (data.published_at) res.send(`${data.tag_name} ${data.published_at}`)
    else res.send('no releases')
  })
})

app.post('/', function (req, res) {
  console.log(req)
  res.send('ok')
})

app.listen(app.get('port'), function () {
  console.log('application running on port', app.get('port'))
})
