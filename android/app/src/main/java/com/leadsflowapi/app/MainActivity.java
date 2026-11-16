package com.leadsflowapi.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        // Mesmo comportamento em todas as versões: o app desenha por baixo das barras
        // (obrigatório no Android 15+) e o WebView é afastado delas com margens.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        applySafeAreaMargins();
    }

    // Os IDs têm de coincidir com push-notification.service.ts e push-notifications.ts.
    // Criá-los nativamente garante que já existem mesmo quando a primeira notificação
    // chega antes de o JavaScript da WebView terminar de arrancar.
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();

        NotificationChannel messages = new NotificationChannel(
            "leadsflow_messages", "Mensagens", NotificationManager.IMPORTANCE_HIGH
        );
        messages.setDescription("Novas mensagens e respostas de clientes");
        messages.setSound(sound, audio);
        messages.enableVibration(true);
        messages.enableLights(true);
        messages.setLightColor(Color.rgb(37, 99, 235));
        messages.setShowBadge(true);

        NotificationChannel reminders = new NotificationChannel(
            "leadsflow_reminders", "Lembretes", NotificationManager.IMPORTANCE_HIGH
        );
        reminders.setDescription("Tarefas e lembretes importantes");
        reminders.setSound(sound, audio);
        reminders.enableVibration(true);
        reminders.enableLights(true);
        reminders.setLightColor(Color.rgb(37, 99, 235));
        reminders.setShowBadge(true);

        NotificationChannel general = new NotificationChannel(
            "leadsflow_general", "Atualizações", NotificationManager.IMPORTANCE_DEFAULT
        );
        general.setDescription("Leads, campanhas e avisos do sistema");
        general.setSound(sound, audio);
        general.enableVibration(true);
        general.enableLights(true);
        general.setLightColor(Color.rgb(37, 99, 235));
        general.setShowBadge(true);

        manager.createNotificationChannel(messages);
        manager.createNotificationChannel(reminders);
        manager.createNotificationChannel(general);
    }

    // Afasta o WebView da barra de estado, da barra de gestos, do notch e do teclado,
    // para nenhum conteúdo (cabeçalho, barra inferior, campo de texto) ficar tapado.
    private void applySafeAreaMargins() {
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
