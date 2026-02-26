// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')

const metadataManagerPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java')
const musicServicePath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicService.java')

const patchs = [
  // 补丁 1: 修复 MediaSession flags + 设置 sessionActivity + 存储 token
  // 原始代码只设了 FLAG_HANDLES_QUEUE_COMMANDS，丢失了 FLAG_HANDLES_MEDIA_BUTTONS 和 FLAG_HANDLES_TRANSPORT_CONTROLS
  // 卓易通需要 FLAG_HANDLES_TRANSPORT_CONTROLS 才会在下拉控制中心显示媒体控制卡片
  [
    metadataManagerPath,
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

  // 补丁 2: 修复 contentIntent 的 PendingIntent FLAG_IMMUTABLE 问题
  // 原始代码使用 FLAG_CANCEL_CURRENT，在 API 31+（卓易通可能运行在此环境）会崩溃
  [
    metadataManagerPath,
    'builder.setContentIntent(PendingIntent.getActivity(context, 0, openApp, PendingIntent.FLAG_CANCEL_CURRENT));',
    'builder.setContentIntent(PendingIntent.getActivity(context, 0, openApp, Build.VERSION.SDK_INT >= 31 ? (PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE) : PendingIntent.FLAG_CANCEL_CURRENT));',
  ],

  // 补丁 3: 移除华为设备 MediaStyle 检查
  // 原始代码跳过旧华为设备的 MediaStyle，但在卓易通（HarmonyOS）环境可能误判
  // Build.MANUFACTURER 可能含 "huawei"，若 SDK_INT 上报异常会导致 MediaStyle 不生效
  [
    metadataManagerPath,
    '// Prevent the media style from being used in older Huawei devices that don\'t support custom styles\n        if(!Build.MANUFACTURER.toLowerCase().contains("huawei") || Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {',
    '// MediaStyle 在所有设备上启用（移除旧华为设备检查，避免卓易通环境误判）\n        if(true) {',
  ],

  // 补丁 4: 将 MusicService 的父类从 HeadlessJsTaskService 改为 HeadlessMediaBrowserService
  // 核心修复：标准 Android 音乐播放器（如网易云音乐）的主服务继承 MediaBrowserServiceCompat
  // 卓易通通过 MediaBrowserService 机制发现媒体会话，MusicService 必须本身就是 MediaBrowserServiceCompat
  [
    musicServicePath,
    'extends HeadlessJsTaskService',
    'extends HeadlessMediaBrowserService',
  ],

  // 补丁 5: 在 MusicService 创建 MusicManager 后设置 MediaBrowserServiceCompat 的 session token
  // MusicManager 构造时会创建 MetadataManager → MediaSession，token 存入 MediaSessionTokenHolder
  // 此处将 token 设置到 MusicService（现在是 MediaBrowserServiceCompat）上，让系统能发现媒体会话
  [
    musicServicePath,
    '        manager = new MusicManager(this);\n        handler = new Handler();\n\n        super.onStartCommand(intent, flags, startId);',
    [
      '        manager = new MusicManager(this);',
      '        handler = new Handler();',
      '',
      '        // Set MediaBrowserServiceCompat session token for system media browsers',
      '        {',
      '            android.support.v4.media.session.MediaSessionCompat.Token sessionToken =',
      '                com.guichaguri.trackplayer.service.metadata.MediaSessionTokenHolder.getSessionToken();',
      '            if (sessionToken != null) {',
      '                setSessionToken(sessionToken);',
      '                android.util.Log.i("LxMediaBrowser", "MusicService: setSessionToken on MediaBrowserServiceCompat");',
      '            }',
      '        }',
      '',
      '        super.onStartCommand(intent, flags, startId);',
    ].join('\n'),
  ],

  // 补丁 6: 在 MetadataManager 构造函数末尾提前激活 MediaSession
  // 核心修复：原始代码在构造时不设置 PlaybackState、不激活 session、不应用 MediaStyle
  // 导致 session 在用户真正播放音乐之前一直处于非活跃状态
  // 卓易通/系统在服务启动时扫描 MediaSession，如果此时 session 未激活则会被忽略
  // 网易云音乐等正常播放器会在服务启动时立即激活 session
  [
    metadataManagerPath,
    'builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC);',
    [
      'builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC);',
      '        // Early MediaSession activation for system/卓易通 media discovery',
      '        {',
      '            PlaybackStateCompat initState = new PlaybackStateCompat.Builder()',
      '                .setActions(',
      '                    PlaybackStateCompat.ACTION_PLAY |',
      '                    PlaybackStateCompat.ACTION_PAUSE |',
      '                    PlaybackStateCompat.ACTION_STOP |',
      '                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT |',
      '                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |',
      '                    PlaybackStateCompat.ACTION_SEEK_TO)',
      '                .setState(PlaybackStateCompat.STATE_NONE, 0, 1f)',
      '                .build();',
      '            session.setPlaybackState(initState);',
      '',
      '            MediaMetadataCompat initMeta = new MediaMetadataCompat.Builder()',
      '                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "LX Music")',
      '                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)',
      '                .build();',
      '            session.setMetadata(initMeta);',
      '',
      '            MediaStyle initStyle = new MediaStyle();',
      '            initStyle.setMediaSession(session.getSessionToken());',
      '            builder.setStyle(initStyle);',
      '',
      '            session.setActive(true);',
      '            android.util.Log.i("LxMediaBrowser", "MetadataManager: early session activation with PlaybackState + MediaStyle");',
      '',
      '            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {',
      '                service.startForeground(1, builder.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);',
      '            } else {',
      '                service.startForeground(1, builder.build());',
      '            }',
      '        }',
    ].join('\n'),
  ],

  // 补丁 7: 改进 MusicService.onCreate() 的初始通知
  // 原始代码创建了一个完全空白的通知（无 smallIcon、无 category、无 visibility）
  // 这在卓易通上可能导致通知被系统忽略或不显示
  // 改为创建一个最小但合规的媒体通知，并在 API 29+ 显式声明 foregroundServiceType
  [
    musicServicePath,
    'startForeground(1, new NotificationCompat.Builder(this, channel).build());',
    [
      '{',
      '            NotificationCompat.Builder initBuilder = new NotificationCompat.Builder(this, channel);',
      '            initBuilder.setSmallIcon(com.guichaguri.trackplayer.R.drawable.play);',
      '            initBuilder.setCategory(NotificationCompat.CATEGORY_TRANSPORT);',
      '            initBuilder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC);',
      '            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {',
      '                startForeground(1, initBuilder.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);',
      '            } else {',
      '                startForeground(1, initBuilder.build());',
      '            }',
      '        }',
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
  [
    path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/HeadlessMediaBrowserService.java'),
    `package com.guichaguri.trackplayer.service;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.PowerManager;
import android.support.v4.media.MediaBrowserCompat;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceEventListener;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
import com.facebook.react.jstasks.HeadlessJsTaskContext;
import com.facebook.react.jstasks.HeadlessJsTaskEventListener;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * Hybrid base class: MediaBrowserServiceCompat + HeadlessJsTaskService functionality.
 * Allows MusicService to be discoverable by system media browsers (e.g. DroiTong)
 * while still supporting React Native headless JS tasks.
 *
 * Based on React Native 0.73.11 HeadlessJsTaskService (MIT License, Meta Platforms Inc.)
 */
public abstract class HeadlessMediaBrowserService extends MediaBrowserServiceCompat
        implements HeadlessJsTaskEventListener {

    private static final String BROWSER_ROOT_ID = "lx_music_root";
    private final Set<Integer> mActiveTasks = new CopyOnWriteArraySet<>();
    private static @Nullable PowerManager.WakeLock sWakeLock;

    // ==================== HeadlessJsTaskService functionality ====================

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        HeadlessJsTaskConfig taskConfig = getTaskConfig(intent);
        if (taskConfig != null) {
            startTask(taskConfig);
            return START_REDELIVER_INTENT;
        }
        return START_NOT_STICKY;
    }

    protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
        return null;
    }

    @SuppressLint("WakelockTimeout")
    public static void acquireWakeLockNow(Context context) {
        if (sWakeLock == null || !sWakeLock.isHeld()) {
            PowerManager powerManager =
                (PowerManager) context.getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                sWakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    HeadlessMediaBrowserService.class.getCanonicalName());
                sWakeLock.setReferenceCounted(false);
                sWakeLock.acquire();
            }
        }
    }

    protected void startTask(final HeadlessJsTaskConfig taskConfig) {
        UiThreadUtil.assertOnUiThread();
        acquireWakeLockNow(this);
        final ReactInstanceManager reactInstanceManager =
            getReactNativeHost().getReactInstanceManager();
        ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
        if (reactContext == null) {
            reactInstanceManager.addReactInstanceEventListener(
                new ReactInstanceEventListener() {
                    @Override
                    public void onReactContextInitialized(ReactContext reactContext) {
                        invokeStartTask(reactContext, taskConfig);
                        reactInstanceManager.removeReactInstanceEventListener(this);
                    }
                });
            reactInstanceManager.createReactContextInBackground();
        } else {
            invokeStartTask(reactContext, taskConfig);
        }
    }

    private void invokeStartTask(ReactContext reactContext, final HeadlessJsTaskConfig taskConfig) {
        final HeadlessJsTaskContext headlessJsTaskContext =
            HeadlessJsTaskContext.getInstance(reactContext);
        headlessJsTaskContext.addTaskEventListener(this);

        UiThreadUtil.runOnUiThread(
            new Runnable() {
                @Override
                public void run() {
                    int taskId = headlessJsTaskContext.startTask(taskConfig);
                    mActiveTasks.add(taskId);
                }
            });
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (getReactNativeHost().hasInstance()) {
            ReactInstanceManager reactInstanceManager =
                getReactNativeHost().getReactInstanceManager();
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
            if (reactContext != null) {
                HeadlessJsTaskContext headlessJsTaskContext =
                    HeadlessJsTaskContext.getInstance(reactContext);
                headlessJsTaskContext.removeTaskEventListener(this);
            }
        }
        if (sWakeLock != null) {
            sWakeLock.release();
        }
    }

    @Override
    public void onHeadlessJsTaskStart(int taskId) {}

    @Override
    public void onHeadlessJsTaskFinish(int taskId) {
        mActiveTasks.remove(taskId);
        if (mActiveTasks.size() == 0) {
            stopSelf();
        }
    }

    protected ReactNativeHost getReactNativeHost() {
        return ((ReactApplication) getApplication()).getReactNativeHost();
    }

    // ==================== MediaBrowserServiceCompat functionality ====================

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid,
            @Nullable Bundle rootHints) {
        return new BrowserRoot(BROWSER_ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentId,
            @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(Collections.emptyList());
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
