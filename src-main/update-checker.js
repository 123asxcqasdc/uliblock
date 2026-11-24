const http = require('http');
const https = require('https');
const settings = require('./settings');
const UpdateWindow = require('./windows/update');
const packageJSON = require('../package.json');

const REPO = '123asxcqasdc/uliblock';
const LATEST_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
const currentVersion = packageJSON.version;

/**
 * Determines whether the update checker is allowed to run in this build.
 * @returns {boolean}
 */
const isUpdateCheckerAllowed = () => {
  if (process.env.ULIBLOCK_DISABLE_UPDATE_CHECKER) {
    return false;
  }
  return true;
};

/**
 * Resolves the latest release tag via HTTP redirect on github.com/.../releases/latest
 * (avoids GitHub REST API rate limits).
 * @param {string} url
 * @param {number} [redirectsLeft]
 * @returns {Promise<{tag: string, version: string, releaseUrl: string} | null>}
 */
const resolveLatestReleaseRedirect = (url = LATEST_RELEASE_URL, redirectsLeft = 5) => new Promise((resolve, reject) => {
  if (redirectsLeft < 0) {
    resolve(null);
    return;
  }

  const parsedURL = new URL(url);
  const mod = parsedURL.protocol === 'http:' ? http : https;
  const req = mod.request(url, {
    method: 'HEAD',
    timeout: 12000,
    headers: {
      'user-agent': `${packageJSON.name}/${currentVersion}`
    }
  }, (res) => {
    res.resume();
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      const nextUrl = new URL(res.headers.location, url).toString();
      const tagMatch = nextUrl.match(/\/releases\/tag\/([^/?#]+)/i);
      if (tagMatch) {
        const tag = decodeURIComponent(tagMatch[1]);
        const version = tag.replace(/^v/i, '');
        resolve({
          tag,
          version,
          releaseUrl: nextUrl
        });
        return;
      }
      resolveLatestReleaseRedirect(nextUrl, redirectsLeft - 1).then(resolve, reject);
      return;
    }

    const tagMatch = url.match(/\/releases\/tag\/([^/?#]+)/i);
    if (tagMatch) {
      const tag = decodeURIComponent(tagMatch[1]);
      resolve({
        tag,
        version: tag.replace(/^v/i, ''),
        releaseUrl: url
      });
      return;
    }

    resolve(null);
  });

  req.on('timeout', () => {
    req.destroy(new Error('Timeout checking latest UliBlock release'));
  });
  req.on('error', reject);
  req.end();
});

/**
 * Best-effort fetch of release notes from GitHub API (non-fatal if rate-limited).
 * @param {string} tag
 * @returns {Promise<string>}
 */
const fetchReleaseNotes = (tag) => new Promise((resolve) => {
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`;
  const req = https.get(apiUrl, {
    timeout: 8000,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': `${packageJSON.name}/${currentVersion}`
    }
  }, (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      resolve('');
      return;
    }
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve(typeof data.body === 'string' ? data.body : '');
      } catch (_e) {
        resolve('');
      }
    });
  });
  req.on('timeout', () => {
    req.destroy();
    resolve('');
  });
  req.on('error', () => resolve(''));
});

const checkForUpdates = async () => {
  if (!isUpdateCheckerAllowed() || settings.updateChecker === 'never') {
    return;
  }

  if (UpdateWindow.isOpen()) {
    return;
  }

  const latestInfo = await resolveLatestReleaseRedirect(LATEST_RELEASE_URL);
  if (!latestInfo || !latestInfo.version) {
    return;
  }

  const semverValid = require('semver/functions/valid');
  const semverLt = require('semver/functions/lt');

  const latestVersion = semverValid(latestInfo.version);
  const currentValid = semverValid(currentVersion);
  if (!latestVersion || !currentValid) {
    return;
  }

  const now = Date.now();
  const ignoredUpdate = settings.ignoredUpdate;
  const ignoredUpdateUntil = settings.ignoredUpdateUntil * 1000;
  if (ignoredUpdate === latestVersion && now < ignoredUpdateUntil) {
    return;
  }

  if (semverLt(currentValid, latestVersion)) {
    const releaseNotes = await fetchReleaseNotes(latestInfo.tag);
    UpdateWindow.updateAvailable({
      currentVersion: currentValid,
      latestVersion,
      tag: latestInfo.tag,
      releaseUrl: latestInfo.releaseUrl,
      releaseNotes
    });
  }
};

/**
 * @param {string} version
 * @param {Date} until
 */
const ignoreUpdate = async (version, until) => {
  settings.ignoredUpdate = version;
  settings.ignoredUpdateUntil = Math.floor(until.getTime() / 1000);
  await settings.save();
};

module.exports = {
  isUpdateCheckerAllowed,
  checkForUpdates,
  ignoreUpdate
};
