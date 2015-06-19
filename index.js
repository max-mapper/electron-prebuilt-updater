'use strict'

const GitHubApi = require('github')
const Promise = require('bluebird')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const express = require('express')
const fs = Promise.promisifyAll(require('fs'))
const npm = require('npm')
const path = require('path')

const app = express()
const github = new GitHubApi({
  version: '3.0.0',
  headers: {
    'User-Agent': 'electron-prebuilt-updater'
  }
})
const apiKey = process.env.API_KEY
const email = process.env.EMAIL
const owner = process.env.OWNER
const repo = process.env.REPO
const secret = process.env.SECRET
const token = process.env.TOKEN

Promise.longStackTraces()
app.use(bodyParser.json())
app.set('port', (process.env.PORT || 5000))
app.post('/', function (req, res) {
  let hubSignature = req.headers['x-hub-signature'].replace('sha1=', '')
  let signature = crypto.createHmac('sha1', secret)
                        .update(JSON.stringify(req.body))
                        .digest('hex')

  console.error('post body', JSON.stringify(req.body))
  console.error('post headers', JSON.stringify(req.headers))
  
  if (req.body.release && signature === hubSignature) {
    let createReleaseAsync = Promise.promisify(github.releases.createRelease)
    let getContentAsync = Promise.promisify(github.repos.getContent)
    let updateFileAsync = Promise.promisify(github.repos.updateFile)
    let newVersion = req.body.release.tag_name.replace('v', '')
    let npmrc = path.resolve(process.env.HOME, '.npmrc')

    github.authenticate({ type: 'oauth', token: token })
    getContentAsync({
      user: owner,
      repo: repo,
      path: 'package.json'
    })
    .catch(function (err) {
      console.error('Failed to get remote file: package.json')
      throw err
    })
    .then(function (file) {
      let content = JSON.parse(new Buffer(file.content, 'base64').toString())
      content.version = newVersion

      return updateFileAsync({
        user: owner,
        repo: repo,
        path: 'package.json',
        message: `Update to Electron v${newVersion}`,
        content: new Buffer(JSON.stringify(content, null, '  '))
                                .toString('base64'),
        sha: file.sha
      })
      .catch(function (err) {
        console.error('Failed to update remote file: package.json')
        throw err
      })
    })
    .then(function () {
      return fs.statAsync(npmrc)
    })
    .catch(function (err) {
      if (err.code === 'ENOENT') return null
      else {
        console.error(`Failed to stat file: ${npmrc}`)
        throw err
      }
    })
    .then(function (stat) {
      if (!stat) {
        let content = `_auth=${apiKey}\nemail=${email}`
        return fs.writeFileAsync(npmrc, content)
        .catch(function (err) {
          console.error(`Failed to write file: ${npmrc}`)
          throw err
        })
      }
    })
    .then(function () {
      return createReleaseAsync({
        owner: owner,
        repo: repo,
        tag_name: `v${newVersion}`,
        name: `v${newVersion}`,
        body: newVersion
      })
      .catch(function (err) {
        console.error('Failed to create release')
        throw err
      })
    })
    .then(function (release) {
      npm.load({}, function (err) {
        if (err) {
          console.error('Failed to load npm')
          throw err
        }
        npm.commands.publish([release.tarball_url], function (err) {
          if (err) {
            console.error('Failed to publish package')
            throw err
          }
        })
      })
    })
    .then(function () {
      return res.send(`Update to Electron v${newVersion}`)
    })
  } else {
    return res.status(403).send('This service only responds to release events')
  }
})

app.listen(app.get('port'), function () {
  console.log('application running on port', app.get('port'))
})
