'use strict'

const GitHubApi = require('github')
const Promise = require('bluebird')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const express = require('express')

const app = express()
const github = new GitHubApi({
  version: '3.0.0',
  headers: {
    'User-Agent': 'electron-prebuilt-updater'
  }
})
const secret = process.env.SECRET
const token = process.env.TOKEN

app.use(bodyParser.json())

app.set('port', (process.env.PORT || 5000))

app.post('/', function (req, res) {
  let signature = crypto.createHmac('sha1', secret)
                        .update(JSON.stringify(req.body))
                        .digest('hex')

  if (signature === req.headers['x-hub-signature']) {
    let getContentAsync = Promise.promisify(github.repos.getContent)
    let updateFileAsync = Promise.promisify(github.repos.updateFile)
    let newVersion = req.body.release.tag_name.replace('v', '')

    github.authenticate({ type: 'oauth', token: token })
    getContentAsync({
      user: 'johnmuhl',
      repo: 'electron-prebuilt',
      path: 'package.json'
    })
    .then(function (file) {
      let content = JSON.parse(new Buffer(file.content, 'base64').toString())

      return updateFileAsync({
        user: 'johnmuhl',
        repo: 'electron-prebuilt',
        path: 'package.json',
        message: `Update to Electron v${newVersion}`,
        content: new Buffer(JSON.stringify(content)).toString('base64'),
        sha: file.sha
      })
    })
    .then(function () {
      return res.send(`Update to Electron v${newVersion}`)
    })
  } else {
    return res.send('signature does not match payload')
  }
})

app.listen(app.get('port'), function () {
  console.log('application running on port', app.get('port'))
})
