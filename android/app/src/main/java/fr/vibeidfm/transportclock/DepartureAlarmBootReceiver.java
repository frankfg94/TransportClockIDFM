package fr.vibeidfm.transportclock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class DepartureAlarmBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            DepartureAlarmService.ensureChannels(context);
            DepartureAlarmScheduler.reschedulePending(context);
        } catch (RuntimeException ignored) {
            // The app reconciles permissions and pending alarms on next launch.
        }
    }
}
