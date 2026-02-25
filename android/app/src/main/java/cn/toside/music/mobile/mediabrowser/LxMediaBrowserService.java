package cn.toside.music.mobile.mediabrowser;

import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.session.MediaSessionCompat;

import com.guichaguri.trackplayer.service.metadata.MediaSessionTokenHolder;

import java.util.Collections;
import java.util.List;

/**
 * MediaBrowserService 实现，使系统（包括 HarmonyOS 卓易通）能通过标准的
 * MediaBrowser 协议发现本应用的媒体播放会话，从而在下拉快捷面板中显示音乐控制卡片。
 *
 * 本 Service 不提供媒体浏览功能（浏览树为空），仅暴露 MediaSession Token。
 */
public class LxMediaBrowserService extends MediaBrowserServiceCompat {

    private static final String BROWSER_ROOT_ID = "lx_music_root";

    @Override
    public void onCreate() {
        super.onCreate();

        // 尝试立即获取已有的 token
        MediaSessionCompat.Token token = MediaSessionTokenHolder.getSessionToken();
        if (token != null) {
            setSessionToken(token);
        }

        // 注册监听器，当 track-player 创建 MediaSession 后自动设置 token
        MediaSessionTokenHolder.setTokenListener(new MediaSessionTokenHolder.TokenListener() {
            @Override
            public void onTokenReady(MediaSessionCompat.Token token) {
                setSessionToken(token);
            }
        });
    }

    /**
     * 控制谁可以连接到此 MediaBrowserService。
     * 返回非 null 的 BrowserRoot 允许连接。
     */
    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        return new BrowserRoot(BROWSER_ROOT_ID, null);
    }

    /**
     * 返回指定父 ID 下的子媒体项。
     * 本应用不支持媒体浏览，返回空列表。
     */
    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(Collections.emptyList());
    }

    @Override
    public void onDestroy() {
        MediaSessionTokenHolder.setTokenListener(null);
        super.onDestroy();
    }
}
