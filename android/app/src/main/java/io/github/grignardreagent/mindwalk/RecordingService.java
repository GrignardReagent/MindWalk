package io.github.grignardreagent.mindwalk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/** Shows "recording" in the notification bar and keeps the microphone and CPU on while locked. */
public class RecordingService extends Service {
    private static final String CHANNEL = "recording";
    private static final long MAX_HOLD_MS = 3 * 60 * 60 * 1000L;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(
                new NotificationChannel(CHANNEL, getString(R.string.recording_channel), NotificationManager.IMPORTANCE_LOW)
            );
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mic)
            .setContentTitle(getString(R.string.recording_title))
            .setContentText(getString(R.string.recording_text))
            .setContentIntent(tap)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
        int type = Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
        try {
            ServiceCompat.startForeground(this, 1, notification, type);
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (wakeLock == null) {
            PowerManager power = getSystemService(PowerManager.class);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MindWalk:recording");
            wakeLock.acquire(MAX_HOLD_MS);
        }
        return START_NOT_STICKY;
    }

    // Swiping the app away ends the page that was recording, so stop showing it.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
