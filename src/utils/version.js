import { httpFetch } from '@/utils/request'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME, GITHUB_REPO } from '@/config/constant'

const abiPriority = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

/**
 * 从 GitHub Releases API 获取最新 debug release
 */
const getLatestRelease = async() => {
  const url = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/releases/tags/${GITHUB_REPO.releaseTag}`
  const { promise } = httpFetch(url, {
    method: 'get',
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
    timeout: 15000,
  })
  const resp = await promise
  if (resp.statusCode !== 200) {
    throw new Error(`GitHub API error: ${resp.statusCode}`)
  }
  return resp.body
}

/**
 * 从 APK 文件名中解析版本号
 * e.g. lx-music-mobile-v1.8.1-arm64-v8a.apk → 1.8.1
 */
const parseVersionFromAsset = (name) => {
  const match = name.match(/v([\d.]+(?:-[a-zA-Z0-9.]+)?)/)
  return match ? match[1] : null
}

/**
 * 从 release assets 中找到最匹配当前设备架构的 APK
 */
const findBestApkAsset = async(assets) => {
  const apkAssets = assets.filter(a => a.name.endsWith('.apk'))
  if (apkAssets.length === 0) throw new Error('No APK asset found in release')
  if (apkAssets.length === 1) return apkAssets[0]

  const supportedAbis = await getSupportedAbis()
  for (const abi of abiPriority) {
    if (abi !== 'universal' && !supportedAbis.includes(abi)) continue
    const match = apkAssets.find(a => a.name.includes(abi))
    if (match) return match
  }
  return apkAssets[0]
}

export const getVersionInfo = async() => {
  const release = await getLatestRelease()
  const apkAsset = await findBestApkAsset(release.assets || [])

  const version = parseVersionFromAsset(apkAsset.name) || release.tag_name
  const desc = release.body || ''

  return {
    version,
    desc,
    history: [],
    downloadUrl: apkAsset.browser_download_url,
  }
}

let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

export const downloadNewVersion = async(downloadUrl, onDownload = noop) => {
  let savePath = temporaryDirectoryPath + '/lx-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(downloadUrl, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 60000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
