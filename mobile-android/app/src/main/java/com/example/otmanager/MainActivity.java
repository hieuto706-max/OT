package com.example.otmanager;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.DownloadListener;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketException;
import java.net.URL;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(1);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Ép tăng tốc phần cứng cho cửa sổ (Window) ứng dụng
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        webView = new WebView(this);
        setContentView(webView);

        // Bật lớp phần cứng dựng hình GPU cho WebView
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Yêu cầu quyền hiển thị thông báo trên Android 13+
        if (Build.VERSION.SDK_INT >= 33) {
            if (androidx.core.content.ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                androidx.core.app.ActivityCompat.requestPermissions(this,
                        new String[]{"android.permission.POST_NOTIFICATIONS"}, 101);
            }
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        
        // Cho phép truy cập file cục bộ
        try {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        } catch (Exception e) {
            // Bỏ qua
        }

        // Mixed content và database luôn hoạt động từ API 21/29
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        try {
            settings.setDatabaseEnabled(true);
        } catch (Exception e) {
            // Bỏ qua
        }
        
        // Cấu hình ưu tiên vẽ cao và tối ưu cache
        try {
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        } catch (Exception e) {
            // Bỏ qua
        }
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.endsWith(".apk") || url.contains("/OT-Manager-mobile.apk"))) {
                    try {
                        downloadAndInstallApk(url);
                        return true;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                return super.shouldOverrideUrlLoading(view, url);
            }

            @android.annotation.TargetApi(android.os.Build.VERSION_CODES.N)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url != null && (url.endsWith(".apk") || url.contains("/OT-Manager-mobile.apk"))) {
                    try {
                        downloadAndInstallApk(url);
                        return true;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                try {
                    downloadAndInstallApk(url);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        });
        
        // Đăng ký Bridge Javascript với Native Android sử dụng public class tĩnh để tránh lỗi reflection trên một số dòng máy
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidBridge");

        // Xử lý nút Back bằng OnBackPressedCallback (thay thế onBackPressed deprecated)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // Tắt callback này để hệ thống xử lý back mặc định (thoát Activity)
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }

    private String fetchRentryUrl() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://rentry.co/otmanager-hieutm-3456?t=" + System.currentTimeMillis());
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
            
            int responseCode = conn.getResponseCode();
            if (responseCode == 200) {
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String inputLine;
                StringBuilder response = new StringBuilder();
                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();
                
                String html = response.toString();
                Pattern pattern = Pattern.compile("href=\"(https://[a-zA-Z0-9.-]+\\.[a-zA-Z]+)\" class=\"external\"");
                Matcher matcher = pattern.matcher(html);
                if (matcher.find()) {
                    return matcher.group(1);
                }
                
                Pattern patternFallback = Pattern.compile("https://[a-zA-Z0-9.-]+\\.lhr\\.life");
                Matcher matcherFallback = patternFallback.matcher(html);
                if (matcherFallback.find()) {
                    return matcherFallback.group(0);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return null;
    }

    private String getHostFromUrl(String urlString) {
        try {
            URL url = new URL(urlString);
            return url.getHost();
        } catch (Exception e) {
            return null;
        }
    }

    public void autoDiscoverAndConnectServer() {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                // 1. Thử kết nối thông qua Rentry Dynamic Server IP trước (qua Internet)
                final String rentryUrl = fetchRentryUrl();
                if (rentryUrl != null) {
                    String host = getHostFromUrl(rentryUrl);
                    if (host != null && isPortOpen(host, 443, 5000)) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                sendServerDiscovered(rentryUrl);
                            }
                        });
                    }
                }
            }
        });
    }

    private boolean isPortOpen(String ip, int port, int timeout) {
        Socket socket = null;
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(ip, port), timeout);
            return true;
        } catch (IOException e) {
            return false;
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException e) {
                    // Bỏ qua
                }
            }
        }
    }

    private void sendServerDiscovered(String serverUrl) {
        executeJS("if (typeof window.onServerDiscovered === 'function') { " +
                  "  window.onServerDiscovered('" + serverUrl + "'); " +
                  "} else { " +
                  "  localStorage.setItem('ot_server_ip', '" + serverUrl + "'); " +
                  "  if (typeof API !== 'undefined') API = '" + serverUrl + "'; " +
                  "  if (typeof showToast === 'function') showToast('Đã tự động kết nối: " + serverUrl + "', 'success'); " +
                  "}");
    }

    private void executeJS(String jsCode) {
        webView.evaluateJavascript(jsCode, null);
    }

    private void downloadAndInstallApk(final String urlString) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, "Đang tải bản cập nhật mới...", Toast.LENGTH_LONG).show();
            }
        });

        executor.execute(new Runnable() {
            @Override
            public void run() {
                InputStream input = null;
                FileOutputStream output = null;
                HttpURLConnection connection = null;
                try {
                    URL url = new URL(urlString);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.connect();

                    if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                        showToastOnUI("Lỗi máy chủ: " + connection.getResponseMessage());
                        return;
                    }

                    input = connection.getInputStream();
                    File apkFile = new File(getExternalCacheDir(), "update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }
                    output = new FileOutputStream(apkFile);

                    byte[] data = new byte[4096];
                    int count;
                    while ((count = input.read(data)) != -1) {
                        output.write(data, 0, count);
                    }
                    output.flush();

                    // Tải xong, mở trình cài đặt
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, "Tải thành công. Đang mở bộ cài đặt...", Toast.LENGTH_SHORT).show();
                        }
                    });

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    Uri apkUri = FileProvider.getUriForFile(MainActivity.this, 
                            "com.hieuto.otmanager.fileprovider", apkFile);
                    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                    if (!getPackageManager().canRequestPackageInstalls()) {
                        showToastOnUI("Vui lòng cấp quyền cài đặt ứng dụng từ nguồn ngoài để thực hiện cập nhật!");
                        Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                                .setData(Uri.parse("package:" + getPackageName()));
                        startActivity(settingsIntent);
                        return;
                    }

                    startActivity(intent);

                } catch (Exception e) {
                    e.printStackTrace();
                    showToastOnUI("Lỗi tải bản cập nhật: " + e.getMessage());
                } finally {
                    try {
                        if (output != null) output.close();
                        if (input != null) input.close();
                    } catch (IOException ignored) {}
                    if (connection != null) connection.disconnect();
                }
            }
        });
    }

    private void showToastOnUI(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }



    public static class WebAppInterface {
        private final MainActivity activity;

        public WebAppInterface(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void startAutoDiscovery() {
            activity.autoDiscoverAndConnectServer();
        }

        @JavascriptInterface
        public String getAndroidId() {
            try {
                return android.provider.Settings.Secure.getString(
                    activity.getContentResolver(), 
                    android.provider.Settings.Secure.ANDROID_ID
                );
            } catch (Exception e) {
                return "";
            }
        }
    }
}
