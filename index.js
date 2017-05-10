'use strict'

const GitHubApi = require('github')
const Promise = require('bluebird')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const express = require('express')
const fs = Promise.promisifyAll(require('fs'))
const npm = require('npm')
const path = require('path')
const semver = require('semver')

const app = express()
const github = new GitHubApi({
  version: '3.0.0',
  headers: {
    'User-Agent': 'electron-prebuilt-updater'
  }
})

const apiKey = process.env.API_KEY
const email = process.env.EMAIL
const secret = process.env.SECRET
const token = process.env.TOKEN

Promise.longStackTraces()
app.use(bodyParser.json())
app.set('port', (process.env.PORT || 5000))
app.post('/', function (req, res) {
  let packageName = req.query.packageName
  let owner = req.query.owner
  let repo = req.query.repo
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
    let draft = req.body.release.draft
    let prerelease = req.body.release.prerelease
    let npmrc = path.resolve(process.env.HOME, '.npmrc')
    let tsdUrl, oldTsdSha

    if (draft) {
      return res.status(403).send('This service ignores draft releases')
    }

    github.authenticate({ type: 'oauth', token: token })

    // Update `version` field in package.json
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

    // Get existing electron.d.ts (only because we needs its sha)
    .then(function () {
      return getContentAsync({
        user: owner,
        repo: repo,
        path: 'electron.d.ts'
      })
      .catch(function (err) {
        console.error('Failed to get remote file: electron.d.ts')
        throw err
      })
    })

    // Update electron.d.ts
    .then(function (oldTsd) {
      oldTsdSha = oldTsd.sha
      tsdUrl = `https://github.com/electron/electron/releases/download/v${newVersion}/electron.d.ts`
      return got(tsdUrl)
        .catch(function (err) {
          console.error(`Unable to download ${tsdUrl}; maybe this version predates electron.d.ts?`)
          console.error(err)
          return Promise.resolve(null)
        })
    })
    .then(function (response) {
      // Continue the promise chain if electron.d.ts wasn't found, considering
      // backporting releases that may predate existence of electron.d.ts
      if (!response) return Promise.resolve(true)

      return updateFileAsync({
        user: owner,
        repo: repo,
        path: 'electron.d.ts',
        message: `Update electron.d.ts to v${newVersion}`,
        content: new Buffer(response.body).toString('base64'),
        sha: oldTsdSha
      })
      .catch(function (err) {
        console.error('Failed to update remote file: electron.d.ts')
        throw err
      })
    })

    // Add publishing credentials to npmrc
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

    // Publish to GitHub
    .then(function () {
      return createReleaseAsync({
        owner: owner,
        repo: repo,
        tag_name: req.body.release.tag_name,
        name: req.body.release.name,
        body: `[${newVersion} Release Notes](https://github.com/electron/electron/releases/v${newVersion})`,
        prerelease: prerelease
      })
      .catch(function (err) {
        console.error('Failed to create release')
        throw err
      })
    })

    // Publish to npm
    .then(function (release) {
      var npmConfig = {}
      if (prerelease) npmConfig.tag = 'beta'
      npm.load(npmConfig, function (err) {
        if (err) {
          console.error('Failed to load npm')
          throw err
        }

        const publishAsync = Promise.promisify(npm.commands.publish)
        const viewAsync = Promise.promisify(npm.commands.view)
        return viewAsync([`${packageName}@latest`])
        .catch(function (err) {
          console.error('Failed to get package info')
          throw err
        })
        .then(function (response) {
          const info = response[0]
          const lastVersion = info[Object.keys(info)[0]]['dist-tags'].latest
          return publishAsync([release.tarball_url])
          .catch(function (err) {
            console.error('Failed to publish package')
            throw err
          })
          .then(function () {
            if (!prerelease && semver.gt(lastVersion, newVersion)) {
              const execSync = require('child_process').execSync
              execSync(`${__dirname}/node_modules/.bin/npm dist-tags add ${packageName}@${lastVersion} latest`)
            }
          })
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
