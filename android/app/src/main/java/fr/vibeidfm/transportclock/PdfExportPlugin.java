package fr.vibeidfm.transportclock;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Writes only to the new document explicitly chosen in Android's SAF picker. */
@CapacitorPlugin(name = "PdfExport")
public class PdfExportPlugin extends Plugin {
    private boolean exporting;

    @PluginMethod
    public void save(PluginCall call) {
        final String fileName;
        try {
            pdfBytes(call);
            fileName = fileName(call);
        } catch (IllegalArgumentException error) {
            call.reject("Invalid PDF export request", "PDF_INVALID_REQUEST", error);
            return;
        }
        synchronized (this) {
            if (exporting) {
                call.reject("A PDF export is already in progress", "PDF_EXPORT_BUSY");
                return;
            }
            exporting = true;
        }
        getBridge().executeOnMainThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                startActivityForResult(call, intent, "documentCreated");
            } catch (Exception error) {
                finishExport();
                call.reject("PDF document picker is unavailable", "PDF_PICKER_UNAVAILABLE", error);
            }
        });
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) { finishExport(); return; }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            finishExport();
            JSObject response = new JSObject();
            response.put("status", "cancelled");
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            finishExport();
            call.reject("No PDF destination was returned", "PDF_DESTINATION_MISSING");
            return;
        }
        getBridge().execute(() -> {
            try {
                byte[] bytes = pdfBytes(call);
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                    if (output == null) throw new java.io.IOException("Document output is unavailable");
                    output.write(bytes);
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("status", "saved");
                response.put("uri", uri.toString());
                response.put("fileName", displayName(uri, fileName(call)));
                call.resolve(response);
            } catch (Exception error) {
                // ACTION_CREATE_DOCUMENT created this new file for this export.
                // Remove a partial output when the provider supports deletion.
                try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); }
                catch (Exception ignored) { }
                call.reject("Could not write the PDF document", "PDF_WRITE_FAILED", error);
            } finally {
                finishExport();
            }
        });
    }

    private synchronized void finishExport() { exporting = false; }

    private byte[] pdfBytes(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null) throw new IllegalArgumentException("Missing PDF bytes");
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        if (bytes.length < 5 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
            throw new IllegalArgumentException("Invalid PDF signature");
        }
        return bytes;
    }

    private String fileName(PluginCall call) {
        String value = call.getString("fileName");
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("Missing PDF filename");
        String name = value.trim().replaceAll("[\\\\/\\p{Cntrl}]", "_");
        return name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf") ? name : name + ".pdf";
    }

    private String displayName(Uri uri, String fallback) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (Exception ignored) { }
        return fallback;
    }
}
