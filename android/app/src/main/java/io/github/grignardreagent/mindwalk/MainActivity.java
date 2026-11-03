package io.github.grignardreagent.mindwalk;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);
        // The app is one page, so Back sends it to the background like Home
        // instead of closing it, which would cut off a recording.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                moveTaskToBack(true);
            }
        });
    }
}
