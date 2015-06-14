# electron-prebuilt-updater

A web service that automatically updates and releases a new version of electron-prebuilt when there is a release of Electron.

## create a personal access token

[Generate a new token][tokens]; you'll need it for the Heroku config variables.

## install the web service

1. [![Deploy][image]][deploy]
2. Replace the placeholder config variables with the appropriate values.
3. Click **View** and note the URL. That is the GitHub Webhook Payload URL.

## setup the webhook

1. Create a new webhook with your payload URL and the same secret you used in the Heroku config variables.
2. Click **Let me select individual events**, deselect **Push** and enable **Release**.
3. Click **Add webhook**.

[deploy]: https://heroku.com/deploy
[image]: https://www.herokucdn.com/deploy/button.png
[tokens]: https://github.com/settings/tokens
