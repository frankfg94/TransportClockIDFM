package fr.vibeidfm.transportclock;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DepartureAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        DepartureAlarmService.ensureChannels(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDepartureAlarmIntent(intent);
    }

    private void handleDepartureAlarmIntent(Intent intent) {
        if (
            intent == null ||
            !DepartureAlarmScheduler.ACTION_STOP.equals(intent.getAction())
        ) {
            return;
        }

        int notificationId = intent.getIntExtra(
            DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID,
            -1
        );
        if (notificationId < 0) {
            return;
        }

        String alarmId = null;
        for (
            DepartureAlarmScheduler.AlarmRecord alarm :
            DepartureAlarmScheduler.getDelivered(this)
        ) {
            if (alarm.notificationId == notificationId) {
                alarmId = alarm.alarmId;
                break;
            }
        }

        DepartureAlarmScheduler.removeDelivered(this, notificationId);
        if (alarmId != null) {
            DepartureAlarmPlugin.notifyAlarmAction(alarmId);
        }

        intent.setAction(null);
        intent.removeExtra(DepartureAlarmScheduler.EXTRA_NOTIFICATION_ID);
    }
}
