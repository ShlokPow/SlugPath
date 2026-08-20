import { heartbeatMessage } from '../shared/heartbeat'

// ponytail: setInterval would silently stop once the MV3 service worker suspends
// (~30s idle); chrome.alarms is the correct periodic primitive but needs the
// "alarms" permission, not in the v1 permission list. Load + lifecycle logs only.
console.log(heartbeatMessage('load'))

chrome.runtime.onInstalled.addListener((details) => {
  console.log(heartbeatMessage(`onInstalled:${details.reason}`))
})

chrome.runtime.onStartup.addListener(() => {
  console.log(heartbeatMessage('onStartup'))
})

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/ge-tracker/index.html') })
})
