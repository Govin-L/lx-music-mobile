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
    'session.setFlags(MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);\n        android.util.Log.i("LxMediaBrowser", "MetadataManager: storing session token");\n        MediaSessionTokenHolder.setSessionToken(session.getSessionToken());',
  ],
]

// 需要创建的新文件（放在 track-player 模块内，避免跨模块引用问题）
const newFiles = [
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MediaSessionTokenHolder.java'),
    `package com.guichaguri.trackplayer.service.metadata;

import android.support.v4.media.session.MediaSessionCompat;

/**
 * 静态持有类，用于在 track-player 的 MusicService 和 LxMediaBrowserService 之间共享 MediaSession Token。
 */
public class MediaSessionTokenHolder {

    private static MediaSessionCompat.Token sToken;
    private static TokenListener sListener;

    public interface TokenListener {
        void onTokenReady(MediaSessionCompat.Token token);
    }

    public static synchronized void setSessionToken(MediaSessionCompat.Token token) {
        sToken = token;
        if (sListener != null && token != null) {
            sListener.onTokenReady(token);
        }
    }

    public static synchronized MediaSessionCompat.Token getSessionToken() {
        return sToken;
    }

    public static synchronized void setTokenListener(TokenListener listener) {
        sListener = listener;
        if (listener != null && sToken != null) {
            listener.onTokenReady(sToken);
        }
    }
}
`,
  ],
]

;(async() => {
  // 创建新文件
  for (const [filePath, content] of newFiles) {
    const relativePath = filePath.replace(rootPath, '')
    console.log(`Creating ${relativePath}`)
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      await fs.promises.writeFile(filePath, content)
    } catch (err) {
      console.error(`Create ${relativePath} failed: ${err.message}`)
    }
  }

  // 应用补丁
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
