package fr.vibeidfm.transportclock;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DepartureAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        DepartureAlarmService.ensureChannels(this);
        handleDepartureAlarmIntent(getIntent());
        handleMapIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDepartureAlarmIntent(intent);
        handleMapIntent(intent);
    }

    /**
     * Allow the native black-box test protocol, and future app links, to open
     * the offline global map without enabling WebView debugging in release.
     * Only the app's own localhost /map route is accepted; arbitrary external
     * URLs are never loaded into the Capacitor WebView.
     */
    private void handleMapIntent(Intent intent) {
        if (intent == null || getBridge() == null || intent.getData() == null) {
            return;
        }

        Uri data = intent.getData();
        if (
            !"localhost".equalsIgnoreCase(data.getHost()) ||
            !"/map".equals(data.getPath())
        ) {
            return;
        }

        Uri.Builder target = new Uri.Builder()
            .scheme(getBridge().getScheme())
            .authority(getBridge().getHost())
            .path("/map");
        if (data.getEncodedQuery() != null) {
            target.encodedQuery(data.getEncodedQuery());
        }

        getBridge().getWebView().post(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().loadUrl(target.build().toString());
            }
        });
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
