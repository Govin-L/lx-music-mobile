import { compareVer } from '@/utils'
import { downloadNewVersion, getVersionInfo } from '@/utils/version'
import versionActions from '@/store/version/action'
import versionState, { type InitState } from '@/store/version/state'
import { showVersionModal } from '@/navigation'
import { Navigation } from 'react-native-navigation'

export const showModal = () => {
  if (versionState.showModal) return
  versionActions.setVisibleModal(true)
  showVersionModal()
}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async() => {
  versionActions.setVersionInfo({ status: 'checking' })
  let versionInfo: InitState['versionInfo'] = { ...versionState.versionInfo }
  try {
    const info = await getVersionInfo()
    versionInfo.newVersion = {
      version: info.version,
      desc: info.desc,
      history: info.history || [],
      downloadUrl: info.downloadUrl,
    }
  } catch (err) {
    versionInfo.newVersion = {
      version: '0.0.0',
      desc: '',
      history: [],
      downloadUrl: '',
    }
  }

  if (versionInfo.newVersion.version === '0.0.0') {
    versionInfo.isUnknown = true
    versionInfo.status = 'error'
  } else {
    versionInfo.status = 'idle'
    versionInfo.isUnknown = false
    versionInfo.isLatest = compareVer(versionInfo.version, versionInfo.newVersion.version) > 0
  }

  versionActions.setVersionInfo(versionInfo)
}

export const downloadUpdate = () => {
  const downloadUrl = versionState.versionInfo.newVersion?.downloadUrl
  if (!downloadUrl) return

  versionActions.setVersionInfo({ status: 'downloading' })
  versionActions.setProgress({ total: 0, current: 0 })

  downloadNewVersion(downloadUrl, (total: number, current: number) => {
    versionActions.setProgress({ total, current })
  }).then(() => {
    versionActions.setVersionInfo({ status: 'downloaded' })
  }).catch(() => {
    versionActions.setVersionInfo({ status: 'error' })
  })
}
