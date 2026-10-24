package com.leadsflowapi.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

// Guarda ficheiros gerados no app (exportação de leads, modelo de importação, relatórios)
// na pasta Transferências do telemóvel. O WebView ignora os downloads <a download> do browser.
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");
        if (filename == null || data == null) {
            call.reject("Falta o nome ou o conteúdo do ficheiro");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Conteúdo inválido");
            return;
        }

        try {
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: Transferências pública, sem permissões
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Não foi possível criar o ficheiro");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new Exception("Não foi possível escrever o ficheiro");
                    out.write(bytes);
                }
            } else {
                // Android 6–9: pasta de transferências do próprio app (sem pedir permissões)
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getContext().getFilesDir();
                File file = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            }

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Erro ao guardar o ficheiro");
        }
    }

    // Abre o ficheiro guardado com a aplicação do telemóvel (Folhas, Excel, browser…)
    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri");
        String mimeType = call.getString("mimeType", "*/*");
        if (uri == null) {
            call.reject("Falta o ficheiro");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(uri), mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(Intent.createChooser(intent, null));
            call.resolve();
        } catch (Exception e) {
            call.reject("Nenhuma aplicação para abrir este ficheiro");
        }
    }
}
