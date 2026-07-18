package fr.vibeidfm.transportclock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String DEPARTURE_ALARM_CHANNEL_ID =
        "transport-departure-alarms-v1";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createDepartureAlarmChannel();
    }

    private void createDepartureAlarmChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager =
            getSystemService(NotificationManager.class);
        Uri soundUri = Uri.parse(
            ContentResolver.SCHEME_ANDROID_RESOURCE
                + "://"
                + getPackageName()
                + "/"
                + R.raw.transport_departure_alarm
        );
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        NotificationChannel channel = new NotificationChannel(
            DEPARTURE_ALARM_CHANNEL_ID,
            getString(R.string.departure_alarm_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );

        channel.setDescription(getString(R.string.departure_alarm_channel_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setSound(soundUri, audioAttributes);
        notificationManager.createNotificationChannel(channel);
    }
}
