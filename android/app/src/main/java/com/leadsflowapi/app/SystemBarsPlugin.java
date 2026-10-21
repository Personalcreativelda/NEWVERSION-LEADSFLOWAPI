package com.leadsflowapi.app;

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Pinta a área atrás da barra de estado e da barra de gestos com a cor do tema do app
// e ajusta a cor dos ícones (claros no tema escuro, escuros no tema claro).
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        String color = call.getString("color", "#000000");
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));

        int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Cor inválida: " + color);
            return;
        }

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(parsed);
            View parent = (View) getBridge().getWebView().getParent();
            if (parent != null) parent.setBackgroundColor(parsed);

            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
