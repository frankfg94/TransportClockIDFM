package fr.vibeidfm.transportclock;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "DepartureAlarm")
public class DepartureAlarmPlugin extends Plugin {
    private static volatile DepartureAlarmPlugin instance;

    @Override
    public void load() {
        instance = this;
        DepartureAlarmService.ensureChannels(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
    }

    @PluginMethod
    public void ensureChannels(PluginCall call) {
        DepartureAlarmService.ensureChannels(getContext());
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer notificationId = call.getInt("id");
        String alarmId = call.getString("alarmId");
        Long triggerAtMillis = call.getLong("at");
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        Boolean soundEnabled = call.getBoolean("soundEnabled", true);

        if (notificationId == null || alarmId == null || triggerAtMillis == null) {
            call.reject("id, alarmId and at are required");
            return;
        }
        if (triggerAtMillis <= System.currentTimeMillis()) {
            call.reject("departure-alarm-time-passed");
            return;
        }

        try {
            DepartureAlarmService.ensureChannels(getContext());
            DepartureAlarmScheduler.cancel(getContext(), notificationId);
            DepartureAlarmScheduler.schedule(
                getContext(),
                new DepartureAlarmScheduler.AlarmRecord(
                    notificationId,
                    alarmId,
                    triggerAtMillis,
                    title,
                    body,
                    soundEnabled
                )
            );
            call.resolve();
        } catch (SecurityException error) {
            call.reject("departure-alarm-permission-required", error);
        } catch (RuntimeException error) {
            call.reject("departure-alarm-schedule-failed", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer notificationId = call.getInt("id");
        if (notificationId == null) {
            call.reject("id is required");
            return;
        }

        DepartureAlarmScheduler.cancel(getContext(), notificationId);
        call.resolve();
    }

    @PluginMethod
    public void removeDelivered(PluginCall call) {
        Integer notificationId = call.getInt("id");
        if (notificationId == null) {
            call.reject("id is required");
            return;
        }

        DepartureAlarmScheduler.removeDelivered(getContext(), notificationId);
        call.resolve();
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        call.resolve(recordsResult(
            DepartureAlarmScheduler.getPending(getContext())
        ));
    }

    @PluginMethod
    public void getDelivered(PluginCall call) {
        call.resolve(recordsResult(
            DepartureAlarmScheduler.getDelivered(getContext())
        ));
    }

    private JSObject recordsResult(
        List<DepartureAlarmScheduler.AlarmRecord> records
    ) {
        JSArray alarms = new JSArray();
        for (DepartureAlarmScheduler.AlarmRecord alarm : records) {
            JSObject item = new JSObject();
            item.put("id", alarm.notificationId);
            item.put("alarmId", alarm.alarmId);
            item.put("at", alarm.triggerAtMillis);
            alarms.put(item);
        }

        JSObject result = new JSObject();
        result.put("alarms", alarms);
        return result;
    }

    static void notifyAlarmFired(String alarmId) {
        DepartureAlarmPlugin plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject data = new JSObject();
        data.put("alarmId", alarmId);
        plugin.notifyListeners("alarmFired", data, true);
    }

    static void notifyAlarmAction(String alarmId) {
        DepartureAlarmPlugin plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject data = new JSObject();
        data.put("alarmId", alarmId);
        plugin.notifyListeners("alarmAction", data, true);
    }
}
