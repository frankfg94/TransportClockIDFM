package fr.vibeidfm.transportclock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

public class DepartureAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int notificationId = intent.getIntExtra(
            DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
            -1
        );
        if (notificationId < 0) {
            return;
        }

        if (DepartureAlarmScheduler.ACTION_STOP.equals(intent.getAction())) {
            String alarmId = findAlarmId(context, notificationId);
            DepartureAlarmScheduler.removeDelivered(context, notificationId);
            if (alarmId != null) {
                DepartureAlarmPlugin.notifyAlarmAction(alarmId);
            }
            return;
        }

        DepartureAlarmScheduler.AlarmRecord alarm =
            DepartureAlarmScheduler.consumePending(context, notificationId);
        if (alarm == null) {
            return;
        }

        Intent serviceIntent = new Intent(context, DepartureAlarmService.class)
            .putExtra(
                DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
                alarm.notificationId
            )
            .putExtra(DepartureAlarmScheduler.EXTRA_ALARM_ID, alarm.alarmId)
            .putExtra(DepartureAlarmScheduler.EXTRA_TITLE, alarm.title)
            .putExtra(DepartureAlarmScheduler.EXTRA_BODY, alarm.body)
            .putExtra(
                DepartureAlarmScheduler.EXTRA_SOUND_ENABLED,
                alarm.soundEnabled
            );
        ContextCompat.startForegroundService(context, serviceIntent);
        DepartureAlarmPlugin.notifyAlarmFired(alarm.alarmId);
    }

    private String findAlarmId(Context context, int notificationId) {
        for (
            DepartureAlarmScheduler.AlarmRecord alarm :
            DepartureAlarmScheduler.getDelivered(context)
        ) {
            if (alarm.notificationId == notificationId) {
                return alarm.alarmId;
            }
        }
        return null;
    }
}
