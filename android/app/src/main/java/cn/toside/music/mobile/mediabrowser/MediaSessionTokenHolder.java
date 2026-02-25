package cn.toside.music.mobile.mediabrowser;

import android.support.v4.media.session.MediaSessionCompat;

/**
 * 静态持有类，用于在 track-player 的 MusicService 和 LxMediaBrowserService 之间共享 MediaSession Token。
 * track-player 创建 MediaSession 后会调用 setSessionToken() 存入 token，
 * LxMediaBrowserService 通过 getSessionToken() 获取并暴露给系统。
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
