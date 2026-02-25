// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const patchs = [
  // 补丁: 让 track-player 的 MetadataManager 在创建 MediaSession 后将 token 存入 MediaSessionTokenHolder，
  // 使 LxMediaBrowserService 能获取并暴露给系统（支持 HarmonyOS 卓易通下拉音乐控制）
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java'),
    'session.setFlags(MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);',
    'session.setFlags(MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);\n        cn.toside.music.mobile.mediabrowser.MediaSessionTokenHolder.setSessionToken(session.getSessionToken());',
  ],
]

;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath)).toString()
      await fs.promises.writeFile(filePath, file.replace(fromStr, toStr))
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()

