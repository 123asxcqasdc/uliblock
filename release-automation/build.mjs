import * as fs from 'node:fs';
import * as pathUtil from 'node:path';
import * as childProcess from 'node:child_process';
import * as builder from 'electron-builder';
import * as electronFuses from '@electron/fuses';
import './patch-electron-builder.cjs';

const {Platform, Arch} = builder;

const isProduction = process.argv.includes('--production');

/**
 * @returns {Date}
 */
const getSourceDateEpoch = () => {
  // Used if a better date cannot be obtained for any reason.
  const ARBITRARY_FALLBACK = 1609809111000;

  if (process.env.SOURCE_DATE_EPOCH) {
    return new Date((+process.env.SOURCE_DATE_EPOCH) * 1000);
  }

  const gitProcess = childProcess.spawnSync('git', ['log', '-1', '--pretty=%ct']);

  if (gitProcess.error) {
    if (gitProcess.error.code === 'ENOENT') {
      console.warn('Could not get source date epoch: git is not installed');
      return new Date(ARBITRARY_FALLBACK);
    }
    throw gitProcess.error;
  }

  if (gitProcess.status !== 0) {
    console.warn(`Could not get source date epoch: git returned status ${gitProcess.status}`);
    return new Date(ARBITRARY_FALLBACK);
  }

  const gitStdout = gitProcess.stdout.toString().trim();
  if (/^\d+$/.test(gitStdout)) {
    return new Date((+gitStdout) * 1000);
  }

  console.warn(`Could not get source date epoch: git did not return a date`);
  return new Date(ARBITRARY_FALLBACK);
};

const sourceDateEpoch = getSourceDateEpoch();
process.env.SOURCE_DATE_EPOCH = Math.round(sourceDateEpoch.getTime() / 1000).toString();
console.log(`Source date epoch: ${sourceDateEpoch.toISOString()} (${process.env.SOURCE_DATE_EPOCH})`);

/**
 * @param {string} platformName
 * @returns {string} a string that indexes into Arch[...]
 */
const getDefaultArch = (platformName) => {
  if (platformName === 'WINDOWS') return 'x64';
  if (platformName === 'LINUX') return 'x64';
  throw new Error(`Unknown platform: ${platformName}`);
};

/**
 * @param {string} platformName
 * @returns {string[]}
 */
const getArchesToBuild = (platformName) => {
  const arches = [];
  for (const arg of process.argv) {
    if (arg === '--x64') arches.push('x64');
    if (arg === '--arm64') arches.push('arm64');
  }
  if (arches.length === 0) {
    arches.push(getDefaultArch(platformName));
  }
  return arches;
};

const flipFuses = async (context) => {
  const electronMajorVersion = +context.packager.info.framework.version.split('.')[0];

  /** @type {import('@electron/fuses').FuseV1Config} */
  const newFuses = {
    version: electronFuses.FuseVersion.V1,
    strictlyRequireAllFuses: electronMajorVersion < 41
  };

  newFuses[electronFuses.FuseV1Options.LoadBrowserProcessSpecificV8Snapshot] = false;
  newFuses[electronFuses.FuseV1Options.RunAsNode] = false;
  newFuses[electronFuses.FuseV1Options.EnableNodeOptionsEnvironmentVariable] = false;
  newFuses[electronFuses.FuseV1Options.EnableNodeCliInspectArguments] = false;
  newFuses[electronFuses.FuseV1Options.OnlyLoadAppFromAsar] = false;
  newFuses[electronFuses.FuseV1Options.EnableEmbeddedAsarIntegrityValidation] = false;
  newFuses[electronFuses.FuseV1Options.EnableCookieEncryption] = false;

  if (electronMajorVersion >= 29) {
    newFuses[electronFuses.FuseV1Options.GrantFileProtocolExtraPrivileges] = true;
  }

  if (electronMajorVersion >= 41) {
    newFuses[electronFuses.FuseV1Options.WasmTrapHandlers] = true;
  }

  await context.packager.addElectronFuses(context, newFuses);
};

/**
 * @param {string} directory
 * @param {Date} date
 */
const recursivelySetFileTimes = (directory, date) => {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const filePath = pathUtil.join(directory, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      recursivelySetFileTimes(filePath, date);
    } else {
      fs.utimesSync(filePath, date, date);
    }
  }
  fs.utimesSync(directory, date, date);
};

const afterPack = async (context) => {
  await flipFuses(context);
  recursivelySetFileTimes(context.appOutDir, sourceDateEpoch);
};

const afterSign = async (context) => {
  recursivelySetFileTimes(context.appOutDir, sourceDateEpoch);
};

const build = async ({
  platformName,
  platformType,
  extraConfig = {}
}) => {
  const buildForArch = async (archName) => {
    if (!Object.prototype.hasOwnProperty.call(Arch, archName)) {
      throw new Error(`Unknown arch: ${archName}`);
    }
    const arch = Arch[archName];

    if (!Object.prototype.hasOwnProperty.call(Platform, platformName)) {
      throw new Error(`Unknown platform: ${platformName}`);
    }
    const platform = Platform[platformName];
    const target = platform.createTarget(platformType, arch);

    let distributionName = `${platformName}-${platformType}-${archName}`.toLowerCase();
    if (isProduction) {
      distributionName = `release-${distributionName}`;
    }
    console.log(`Building distribution: ${distributionName}`);

    const config = {
      extraMetadata: {
        tw_dist: distributionName,
        tw_warn_legacy: false,
        tw_update: false
      },
      afterPack,
      afterSign,
      ...extraConfig
    };

    return builder.build({
      targets: target,
      config,
      publish: null
    });
  };

  for (const archName of getArchesToBuild(platformName)) {
    await buildForArch(archName);
  }
};

const buildWindows = async () => {
  await build({
    platformName: 'WINDOWS',
    platformType: 'msi'
  });
  await build({
    platformName: 'WINDOWS',
    platformType: 'nsis'
  });
};

const buildWindowsDir = () => build({
  platformName: 'WINDOWS',
  platformType: 'dir'
});

const buildDebian = () => build({
  platformName: 'LINUX',
  platformType: 'deb'
});

const buildAppImage = () => build({
  platformName: 'LINUX',
  platformType: 'appimage'
});

const buildLinuxDir = () => build({
  platformName: 'LINUX',
  platformType: 'dir'
});

const run = async () => {
  const options = {
    '--windows': buildWindows,
    '--windows-dir': buildWindowsDir,
    '--debian': buildDebian,
    '--appimage': buildAppImage,
    '--linux-dir': buildLinuxDir
  };

  let built = 0;
  for (const arg of process.argv) {
    if (Object.prototype.hasOwnProperty.call(options, arg)) {
      built++;
      await options[arg]();
    }
  }

  if (built === 0) {
    console.log('Need to specify platforms: --windows, --windows-dir, --debian, --appimage, --linux-dir');
    process.exit(1);
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
