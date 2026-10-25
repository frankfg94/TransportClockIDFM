package fr.vibeidfm.transportclock;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DepartureAlarmPlugin.class);
        registerPlugin(ScreenWakeLockPlugin.class);
        registerPlugin(PdfExportPlugin.class);
        super.onCreate(savedInstanceState);
        DepartureAlarmService.ensureChannels(this);
        handleDepartureAlarmIntent(getIntent());
        handleMapIntent(getIntent());
        installWebOverlayBackHandler();
    }

    /** Let the web UI consume Back as Escape before Capacitor handles navigation. */
    private void installWebOverlayBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private void delegateBack() {
                // Preserve the App plugin's backButton listeners and history behavior.
                setEnabled(false);
                try {
                    getOnBackPressedDispatcher().onBackPressed();
                } finally {
                    setEnabled(true);
                }
            }

            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    delegateBack();
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{" +
                    "var dialogs=document.querySelectorAll('[role=\"dialog\"][aria-modal=\"true\"],dialog[open]');" +
                    "var modal=null;for(var i=0;i<dialogs.length;i++){var item=dialogs[i];" +
                    "if(item.getClientRects().length&&getComputedStyle(item).visibility!=='hidden'" +
                    "&&!item.closest('[inert],[aria-hidden=\"true\"]'))modal=item;}" +
                    "var active=document.activeElement||document.body;" +
                    "var target=modal&&!modal.contains(active)?modal:active;if(!target)return false;" +
                    "var event=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});" +
                    "target.dispatchEvent(event);if(event.defaultPrevented)return true;" +
                    "if(modal&&modal.tagName==='DIALOG'&&modal.open){" +
                    "var cancel=new Event('cancel',{cancelable:true});modal.dispatchEvent(cancel);" +
                    "if(!cancel.defaultPrevented)modal.close();return true;}" +
                    "var full=document.fullscreenElement,panel=null;" +
                    "if(!modal){var panels=document.querySelectorAll('aside[tabindex=\"-1\"][aria-label]');" +
                    "for(var j=0;j<panels.length;j++){var candidate=panels[j],rect=candidate.getBoundingClientRect();" +
                    "if(candidate.getClientRects().length&&rect.width>0&&rect.height>0&&rect.bottom>0" +
                    "&&rect.top<window.innerHeight&&rect.right>0&&rect.left<window.innerWidth" +
                    "&&getComputedStyle(candidate).visibility!=='hidden'" +
                    "&&!candidate.closest('[inert],[aria-hidden=\"true\"]')&&(!full||full.contains(candidate)))panel=candidate;}" +
                    "if(panel&&!panel.contains(active)){var panelEvent=new KeyboardEvent('keydown'," +
                    "{key:'Escape',code:'Escape',bubbles:true,cancelable:true});panel.dispatchEvent(panelEvent);" +
                    "if(panelEvent.defaultPrevented)return true;}}" +
                    "if(full){document.exitFullscreen();return true;}return false;" +
                    "}catch(error){return false;}})()",
                    handled -> {
                        if (!"true".equals(handled) && !MainActivity.this.isFinishing()) {
                            delegateBack();
                        }
                    }
                );
            }
        });
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
