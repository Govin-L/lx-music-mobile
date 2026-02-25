package cn.toside.music.mobile.mediabrowser;

import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.session.MediaSessionCompat;

import com.guichaguri.trackplayer.service.metadata.MediaSessionTokenHolder;

import java.util.Collections;
import java.util.List;

public class LxMediaBrowserService extends MediaBrowserServiceCompat {

    private static final String TAG = "LxMediaBrowser";
    private static final String BROWSER_ROOT_ID = "lx_music_root";
    private boolean mSessionTokenSet = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "onCreate: LxMediaBrowserService started");

        // 注册监听器，当 track-player 创建 MediaSession 后自动设置 token
        // 如果 token 已经存在，setTokenListener 会立即回调
        MediaSessionTokenHolder.setTokenListener(new MediaSessionTokenHolder.TokenListener() {
            @Override
            public void onTokenReady(MediaSessionCompat.Token token) {
                updateSessionToken(token);
            }
        });
    }

    private synchronized void updateSessionToken(MediaSessionCompat.Token token) {
        if (mSessionTokenSet || token == null) {
            Log.w(TAG, "updateSessionToken: skipped (already set=" + mSessionTokenSet + ", token null=" + (token == null) + ")");
            return;
        }
        Log.i(TAG, "updateSessionToken: setting session token");
        setSessionToken(token);
        mSessionTokenSet = true;
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        Log.i(TAG, "onGetRoot: client=" + clientPackageName + ", uid=" + clientUid);
        return new BrowserRoot(BROWSER_ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        Log.d(TAG, "onLoadChildren: parentId=" + parentId);
        result.sendResult(Collections.emptyList());
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "onDestroy");
        MediaSessionTokenHolder.setTokenListener(null);
        super.onDestroy();
    }
}
