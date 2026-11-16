package com.leadsflowapi.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Atualizar o APK sem loja (Sobre o app → "Descarregar e instalar"): descarrega o APK novo
 * para a cache do app e abre o instalador do Android, que o instala por cima do atual
 * (os dados e a sessão ficam). O Android pede uma vez "permitir instalar desta origem".
 * Só funciona se o APK novo for assinado com a mesma chave do instalado.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** Pode instalar APKs? (Android 8+: autorização "Instalar apps desconhecidas" para este app) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", canRequestInstalls());
        call.resolve(ret);
    }

    /** Abre o ecrã do Android onde se permite instalar apps a partir do LeadsFlow */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Descarrega o APK (com progresso) e abre o instalador */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String checksum = call.getString("checksum");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Endereço inválido");
            return;
        }
        if (!canRequestInstalls()) {
            call.reject("Falta permitir a instalação de apps a partir do LeadsFlow", "NEEDS_PERMISSION");
            return;
        }

        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File apk = new File(dir, "leadsflow-update.apk");
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                if (conn.getResponseCode() != 200) throw new Exception("O servidor respondeu " + conn.getResponseCode());

                long total = conn.getContentLengthLong();
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        sha.update(buffer, 0, read);
                        done += read;
                        if (total > 0) {
                            int percent = (int) (done * 100 / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject progress = new JSObject();
                                progress.put("percent", percent);
                                notifyListeners("progress", progress);
                            }
                        }
                    }
                }

                if (checksum != null && !checksum.isEmpty()) {
                    StringBuilder hex = new StringBuilder();
                    for (byte b : sha.digest()) hex.append(String.format("%02x", b));
                    if (!hex.toString().equalsIgnoreCase(checksum)) {
                        //noinspection ResultOfMethodCallIgnored
                        apk.delete();
                        throw new Exception("O ficheiro chegou incompleto. Tente de novo.");
                    }
                }

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "O download falhou");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private boolean canRequestInstalls() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }
}
