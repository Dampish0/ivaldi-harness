const { withAndroidManifest } = require('expo/config-plugins');

// Connections are user-selected self-hosted LAN servers, often HTTP. The
// runtime pins server identity before attaching a credential to a saved host.
module.exports = config => withAndroidManifest(config, result => {
  result.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
  return result;
});
