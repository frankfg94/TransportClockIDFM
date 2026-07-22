package fr.vibeidfm.transportclock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.IOException;

public class DepartureAlarmService extends Service {
    static final String SOUND_CHANNEL_ID = "transport-departure-alarm-service-v1";
    static final String SILENT_CHANNEL_ID =
        "transport-departure-alarm-service-silent-v1";
    private static final long MAX_RING_DURATION_MS = 60_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer mediaPlayer;
    private int currentNotificationId = -1;
    private String currentTitle = "";
    private String currentBody = "";
    private boolean currentSoundEnabled = true;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        int notificationId = intent.getIntExtra(
            DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
            -1
        );
        if (DepartureAlarmScheduler.ACTION_STOP.equals(intent.getAction())) {
            if (currentNotificationId < 0) {
                stopSelf(startId);
            } else if (
                notificationId < 0 ||
                notificationId == currentNotificationId
            ) {
                finishPlayback(false);
            }
            return START_NOT_STICKY;
        }

        if (notificationId < 0) {
            stopSelf();
            return START_NOT_STICKY;
        }

        releasePlayer();
        currentNotificationId = notificationId;
        currentTitle = intent.getStringExtra(DepartureAlarmScheduler.EXTRA_TITLE);
        currentBody = intent.getStringExtra(DepartureAlarmScheduler.EXTRA_BODY);
        currentSoundEnabled = intent.getBooleanExtra(
            DepartureAlarmScheduler.EXTRA_SOUND_ENABLED,
            true
        );
        if (currentTitle == null) {
            currentTitle = getString(R.string.departure_alarm_channel_name);
        }
        if (currentBody == null) {
            currentBody = "";
        }

        startForeground(
            currentNotificationId,
            buildNotification(true)
        );

        if (currentSoundEnabled) {
            startAlarmSound();
        } else {
            finishPlayback(true);
        }
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    private void startAlarmSound() {
        try {
            AssetFileDescriptor descriptor = getResources().openRawResourceFd(
                R.raw.transport_departure_alarm
            );
            if (descriptor == null) {
                finishPlayback(true);
                return;
            }

            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            player.setDataSource(
                descriptor.getFileDescriptor(),
                descriptor.getStartOffset(),
                descriptor.getLength()
            );
            descriptor.close();
            player.setLooping(false);
            player.setOnCompletionListener(ignored -> finishPlayback(true));
            player.setOnErrorListener((ignored, what, extra) -> {
                finishPlayback(true);
                return true;
            });
            player.prepare();
            mediaPlayer = player;
            player.start();
            handler.postDelayed(
                () -> finishPlayback(true),
                MAX_RING_DURATION_MS
            );
        } catch (IOException | RuntimeException error) {
            finishPlayback(true);
        }
    }

    private Notification buildNotification(boolean ringing) {
        Intent contentIntent = new Intent(this, MainActivity.class)
            .setAction(DepartureAlarmScheduler.ACTION_STOP)
            .putExtra(
                DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
                currentNotificationId
            )
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentOperation = PendingIntent.getActivity(
            this,
            currentNotificationId,
            contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, DepartureAlarmReceiver.class)
            .setAction(DepartureAlarmScheduler.ACTION_STOP)
            .putExtra(
                DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
                currentNotificationId
            );
        PendingIntent stopOperation = PendingIntent.getBroadcast(
            this,
            currentNotificationId,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            this,
            currentSoundEnabled ? SOUND_CHANNEL_ID : SILENT_CHANNEL_ID
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(currentTitle)
            .setContentText(currentBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(currentBody))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentOperation)
            .setOnlyAlertOnce(true)
            .setOngoing(ringing)
            .setAutoCancel(!ringing);

        if (ringing) {
            builder.addAction(
                R.mipmap.ic_launcher,
                getString(R.string.departure_alarm_stop_action),
                stopOperation
            );
        }
        return builder.build();
    }

    private synchronized void finishPlayback(boolean leaveNotification) {
        int notificationId = currentNotificationId;
        releasePlayer();

        if (notificationId < 0) {
            stopSelf();
            return;
        }

        stopForeground(STOP_FOREGROUND_REMOVE);
        if (leaveNotification) {
            NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.notify(notificationId, buildNotification(false));
        }

        currentNotificationId = -1;
        stopSelf();
    }

    private void releasePlayer() {
        handler.removeCallbacksAndMessages(null);
        MediaPlayer player = mediaPlayer;
        mediaPlayer = null;
        if (player == null) {
            return;
        }
        try {
            if (player.isPlaying()) {
                player.stop();
            }
        } catch (IllegalStateException ignored) {
            // The player can already be in its terminal error state.
        }
        player.reset();
        player.release();
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(
                Context.NOTIFICATION_SERVICE
            );
        createChannel(
            manager,
            SOUND_CHANNEL_ID,
            context.getString(R.string.departure_alarm_channel_name),
            context.getString(R.string.departure_alarm_channel_description),
            true
        );
        createChannel(
            manager,
            SILENT_CHANNEL_ID,
            context.getString(R.string.departure_alarm_silent_channel_name),
            context.getString(R.string.departure_alarm_silent_channel_description),
            false
        );

        // Remove obsolete channels that used a long WAV as notification sound.
        manager.deleteNotificationChannel("transport-departure-alarms-v1");
        manager.deleteNotificationChannel("transport-departure-alarms-v2");
        manager.deleteNotificationChannel("transport-departure-alarms-silent-v1");
    }

    private static void createChannel(
        NotificationManager manager,
        String id,
        String name,
        String description,
        boolean vibrate
    ) {
        NotificationChannel channel = new NotificationChannel(
            id,
            name,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(description);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(null, null);
        channel.enableVibration(vibrate);
        manager.createNotificationChannel(channel);
    }
}
