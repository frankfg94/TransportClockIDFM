package fr.vibeidfm.transportclock;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class DepartureAlarmScheduler {
    static final String ACTION_FIRE =
        "fr.vibeidfm.transportclock.action.DEPARTURE_ALARM_FIRE";
    static final String ACTION_STOP =
        "fr.vibeidfm.transportclock.action.DEPARTURE_ALARM_STOP";
    static final String EXTRA_NOTIFICATION_ID = "nativeNotificationId";
    static final String EXTRA_ALARM_ID = "alarmId";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_SOUND_ENABLED = "soundEnabled";

    private static final String PREFERENCES_NAME = "departure_alarm_runtime";
    private static final String PENDING_PREFIX = "pending_";
    private static final String DELIVERED_PREFIX = "delivered_";

    private DepartureAlarmScheduler() {}

    static void schedule(Context context, AlarmRecord alarm) {
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            throw new IllegalStateException("AlarmManager is unavailable");
        }
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !alarmManager.canScheduleExactAlarms()
        ) {
            throw new SecurityException("Exact alarm permission is required");
        }

        savePending(context, alarm);

        Intent receiverIntent = new Intent(context, DepartureAlarmReceiver.class)
            .setAction(ACTION_FIRE)
            .putExtra(EXTRA_NOTIFICATION_ID, alarm.notificationId);
        PendingIntent operation = PendingIntent.getBroadcast(
            context,
            alarm.notificationId,
            receiverIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent showIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent showOperation = PendingIntent.getActivity(
            context,
            alarm.notificationId,
            showIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // setAlarmClock uses RTC_WAKEUP and leaves Doze for a user-visible alarm.
        try {
            alarmManager.setAlarmClock(
                new AlarmManager.AlarmClockInfo(alarm.triggerAtMillis, showOperation),
                operation
            );
        } catch (RuntimeException error) {
            preferences(context)
                .edit()
                .remove(PENDING_PREFIX + alarm.notificationId)
                .apply();
            operation.cancel();
            throw error;
        }
    }

    static void cancel(Context context, int notificationId) {
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent receiverIntent = new Intent(context, DepartureAlarmReceiver.class)
            .setAction(ACTION_FIRE);
        PendingIntent operation = PendingIntent.getBroadcast(
            context,
            notificationId,
            receiverIntent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (alarmManager != null && operation != null) {
            alarmManager.cancel(operation);
            operation.cancel();
        }

        preferences(context)
            .edit()
            .remove(PENDING_PREFIX + notificationId)
            .remove(DELIVERED_PREFIX + notificationId)
            .apply();
        stopRinging(context, notificationId);
        notificationManager(context).cancel(notificationId);
    }

    static void removeDelivered(Context context, int notificationId) {
        preferences(context)
            .edit()
            .remove(DELIVERED_PREFIX + notificationId)
            .apply();
        stopRinging(context, notificationId);
        notificationManager(context).cancel(notificationId);
    }

    static AlarmRecord consumePending(Context context, int notificationId) {
        AlarmRecord alarm = readRecord(
            preferences(context).getString(PENDING_PREFIX + notificationId, null)
        );
        if (alarm == null) {
            return null;
        }

        preferences(context)
            .edit()
            .remove(PENDING_PREFIX + notificationId)
            .putString(DELIVERED_PREFIX + notificationId, alarm.toJson().toString())
            .apply();
        return alarm;
    }

    static List<AlarmRecord> getPending(Context context) {
        return recordsWithPrefix(context, PENDING_PREFIX);
    }

    static List<AlarmRecord> getDelivered(Context context) {
        return recordsWithPrefix(context, DELIVERED_PREFIX);
    }

    static void reschedulePending(Context context) {
        long now = System.currentTimeMillis();
        for (AlarmRecord alarm : getPending(context)) {
            if (alarm.triggerAtMillis > now) {
                schedule(context, alarm);
            } else {
                preferences(context)
                    .edit()
                    .remove(PENDING_PREFIX + alarm.notificationId)
                    .apply();
            }
        }
    }

    static void stopRinging(Context context, int notificationId) {
        Intent stopIntent = new Intent(context, DepartureAlarmService.class)
            .setAction(ACTION_STOP)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        try {
            context.startService(stopIntent);
        } catch (IllegalStateException ignored) {
            context.stopService(new Intent(context, DepartureAlarmService.class));
        }
    }

    private static void savePending(Context context, AlarmRecord alarm) {
        preferences(context)
            .edit()
            .remove(DELIVERED_PREFIX + alarm.notificationId)
            .putString(PENDING_PREFIX + alarm.notificationId, alarm.toJson().toString())
            .apply();
    }

    private static List<AlarmRecord> recordsWithPrefix(
        Context context,
        String prefix
    ) {
        List<AlarmRecord> records = new ArrayList<>();
        for (Map.Entry<String, ?> entry : preferences(context).getAll().entrySet()) {
            if (!entry.getKey().startsWith(prefix) || !(entry.getValue() instanceof String)) {
                continue;
            }
            AlarmRecord alarm = readRecord((String) entry.getValue());
            if (alarm != null) {
                records.add(alarm);
            }
        }
        return records;
    }

    private static AlarmRecord readRecord(String json) {
        if (json == null) {
            return null;
        }
        try {
            return AlarmRecord.fromJson(new JSONObject(json));
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private static NotificationManager notificationManager(Context context) {
        return (NotificationManager) context.getSystemService(
            Context.NOTIFICATION_SERVICE
        );
    }

    static final class AlarmRecord {
        final int notificationId;
        final String alarmId;
        final long triggerAtMillis;
        final String title;
        final String body;
        final boolean soundEnabled;

        AlarmRecord(
            int notificationId,
            String alarmId,
            long triggerAtMillis,
            String title,
            String body,
            boolean soundEnabled
        ) {
            this.notificationId = notificationId;
            this.alarmId = alarmId;
            this.triggerAtMillis = triggerAtMillis;
            this.title = title;
            this.body = body;
            this.soundEnabled = soundEnabled;
        }

        JSONObject toJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("id", notificationId);
                json.put("alarmId", alarmId);
                json.put("at", triggerAtMillis);
                json.put("title", title);
                json.put("body", body);
                json.put("soundEnabled", soundEnabled);
            } catch (JSONException error) {
                throw new IllegalStateException("Unable to serialize alarm", error);
            }
            return json;
        }

        static AlarmRecord fromJson(JSONObject json) throws JSONException {
            return new AlarmRecord(
                json.getInt("id"),
                json.getString("alarmId"),
                json.getLong("at"),
                json.optString("title", ""),
                json.optString("body", ""),
                json.optBoolean("soundEnabled", true)
            );
        }
    }
}
