package dev.ivaldi.mobile;

import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsAnimation;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/** Keep the WebView full-sized and publish the system IME's actual travel. */
@CapacitorPlugin(name = "IvaldiKeyboardMotion")
public class KeyboardMotionPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) attach();
            call.resolve(result);
        });
    }

    private void attach() {
        getActivity().getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        View root = getActivity().getWindow().getDecorView();
        // Capacitor SystemBars otherwise pads the WebView parent by the complete
        // IME height before its animation starts. This adapter owns that inset.
        View parent = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(parent, (view, insets) -> {
            view.setPadding(0, 0, 0, 0);
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .setVisible(WindowInsetsCompat.Type.ime(), false)
                    .build();
        });
        root.setWindowInsetsAnimationCallback(new WindowInsetsAnimation.Callback(WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            @Override
            public WindowInsetsAnimation.Bounds onStart(WindowInsetsAnimation animation,
                    WindowInsetsAnimation.Bounds bounds) {
                if ((animation.getTypeMask() & WindowInsets.Type.ime()) != 0) {
                    publish(root.getRootWindowInsets(), "start");
                }
                return bounds;
            }

            @Override
            public WindowInsets onProgress(WindowInsets insets, List<WindowInsetsAnimation> animations) {
                for (WindowInsetsAnimation animation : animations) {
                    if ((animation.getTypeMask() & WindowInsets.Type.ime()) != 0) {
                        publish(insets, "progress");
                        break;
                    }
                }
                return insets;
            }

            @Override
            public void onEnd(WindowInsetsAnimation animation) {
                if ((animation.getTypeMask() & WindowInsets.Type.ime()) != 0) {
                    publish(root.getRootWindowInsets(), "end");
                }
            }
        });
        publish(root.getRootWindowInsets(), "end");
        parent.requestApplyInsets();
    }

    private void publish(WindowInsets insets, String phase) {
        if (insets == null) return;
        float density = getActivity().getResources().getDisplayMetrics().density;
        int height = insets.getInsets(WindowInsets.Type.ime()).bottom;
        JSObject event = new JSObject();
        event.put("height", height / density);
        event.put("phase", phase);
        notifyListeners("frame", event);
    }
}
