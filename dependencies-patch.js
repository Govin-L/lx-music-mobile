// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const patchs = [
  // 补丁 1: 修复 MediaSession flags + 设置 sessionActivity + 存储 token
  // 原始代码只设了 FLAG_HANDLES_QUEUE_COMMANDS，丢失了 FLAG_HANDLES_MEDIA_BUTTONS 和 FLAG_HANDLES_TRANSPORT_CONTROLS
  // 卓易通需要 FLAG_HANDLES_TRANSPORT_CONTROLS 才会在下拉控制中心显示媒体控制卡片
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java'),
    'session.setFlags(MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);',
    [
      'session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS | MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);',
      '        // 设置 sessionActivity，让系统知道点击媒体控制卡片时应打开哪个 Activity',
      '        {',
      '            Context ctx = service.getApplicationContext();',
      '            String pkg = ctx.getPackageName();',
      '            Intent launchIntent = ctx.getPackageManager().getLaunchIntentForPackage(pkg);',
      '            if (launchIntent == null) {',
      '                launchIntent = new Intent();',
      '                launchIntent.setPackage(pkg);',
      '                launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);',
      '            }',
      '            launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);',
      '            int piFlags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_CANCEL_CURRENT;',
      '            session.setSessionActivity(PendingIntent.getActivity(ctx, 0, launchIntent, piFlags));',
      '        }',
      '        android.util.Log.i("LxMediaBrowser", "MetadataManager: session flags=7, storing token");',
      '        MediaSessionTokenHolder.setSessionToken(session.getSessionToken());',
    ].join('\n'),
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
