package io.github.grignardreagent.mindwalk;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Lets the page keep the microphone while the screen is off. The page records
 * as before; this only runs RecordingService, which Android requires before an
 * app in the background may use the microphone.
 */
@CapacitorPlugin(
    name = "Recording",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class RecordingPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        startService(call);
    }

    // Recording works either way; without the permission the notification is just hidden.
    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        startService(call);
    }

    private void startService(PluginCall call) {
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), RecordingService.class));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Couldn't keep recording in the background: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), RecordingService.class));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        getContext().stopService(new Intent(getContext(), RecordingService.class));
    }
}
