package dev.ivaldi.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeyboardMotionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
