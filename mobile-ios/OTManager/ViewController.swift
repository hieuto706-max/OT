import UIKit
import WebKit
import Network
import Darwin
import Foundation

class ViewController: UIViewController {

    private var webView: WKWebView!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1) // #020205

        setupWebView()
        loadLocalContent()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Bật localStorage & DOM Storage
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Cho phép inline media playback (tránh fullscreen video trên iPhone)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JavaScript Bridge: đăng ký message handler "iOSBridge"
        let contentController = WKUserContentController()
        contentController.add(self, name: "iOSBridge")
        config.userContentController = contentController

        // Inject script để tạo window.iOSBridge tương thích với AndroidBridge
        let bridgeScript = WKUserScript(
            source: """
            // Tạo cầu nối giữa JavaScript và Swift (tương đương AndroidBridge trên Android)
            window.iOSBridge = {
                startAutoDiscovery: function() {
                    window.webkit.messageHandlers.iOSBridge.postMessage({action: 'startAutoDiscovery'});
                }
            };
            // Đặt flag để JS biết đang chạy trên iOS native app
            window.__IS_IOS_APP__ = true;

            // Tương thích ngược: nếu code JS gọi AndroidBridge, chuyển qua iOSBridge
            if (!window.AndroidBridge) {
                window.AndroidBridge = window.iOSBridge;
            }
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.bounces = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        // Cho phép vuốt quay lại (swipe-back navigation)
        webView.allowsBackForwardNavigationGestures = true

        // Background trong suốt để khớp với dark theme
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1)

        // Auto Layout
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    // MARK: - Load Content

    private func loadLocalContent() {
        guard let wwwPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "www") else {
            showAlert(title: "Lỗi", message: "Không tìm thấy file index.html trong thư mục www.")
            return
        }
        let wwwURL = URL(fileURLWithPath: wwwPath)
        let wwwDir = wwwURL.deletingLastPathComponent()
        webView.loadFileURL(wwwURL, allowingReadAccessTo: wwwDir)
    }

    // MARK: - Auto Discover Server (quét mạng WiFi tìm server OT Manager)

    private func fetchRentryUrl(completion: @escaping (String?) -> Void) {
        guard let url = URL(string: "https://rentry.co/otmanager-hieutm?t=\(Date().timeIntervalSince1970)") else {
            completion(nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 5.0
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)", forHTTPHeaderField: "User-Agent")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard error == nil, let data = data, let html = String(data: data, encoding: .utf8) else {
                completion(nil)
                return
            }
            
            let pattern = "href=\"(https://[a-zA-Z0-9.-]+\\.[a-zA-Z0-9.-]+)\" class=\"external\""
            if let regex = try? NSRegularExpression(pattern: pattern, options: []),
               let match = regex.firstMatch(in: html, options: [], range: NSRange(location: 0, length: html.utf16.count)) {
                if let range = Range(match.range(at: 1), in: html) {
                    completion(String(html[range]))
                    return
                }
            }
            
            let fallbackPattern = "https://[a-zA-Z0-9.-]+\\.lhr\\.life"
            if let regex = try? NSRegularExpression(pattern: fallbackPattern, options: []),
               let match = regex.firstMatch(in: html, options: [], range: NSRange(location: 0, length: html.utf16.count)) {
                if let range = Range(match.range(at: 0), in: html) {
                    completion(String(html[range]))
                    return
                }
            }
            
            completion(nil)
        }.resume()
    }

    private func autoDiscoverServer() {
        fetchRentryUrl { [weak self] resolvedUrl in
            guard let self = self else { return }
            
            if let urlStr = resolvedUrl {
                if self.isServerReachable(urlStr: urlStr, timeout: 5.0) {
                    DispatchQueue.main.async {
                        self.sendServerDiscovered(serverUrl: urlStr)
                    }
                    return
                }
            }
            
            let cloudUrl = "https://api.otmanager.id.vn"
            if self.isServerReachable(urlStr: cloudUrl, timeout: 5.0) {
                DispatchQueue.main.async {
                    self.sendServerDiscovered(serverUrl: cloudUrl)
                }
            }
        }
    }

    private func sendServerDiscovered(serverUrl: String) {
        let js = """
        if (typeof window.onServerDiscovered === 'function') {
            window.onServerDiscovered('\(serverUrl)');
        } else {
            localStorage.setItem('ot_server_ip', '\(serverUrl)');
            if (typeof API !== 'undefined') API = '\(serverUrl)';
            if (typeof showToast === 'function') showToast('Đã tự động kết nối: \(serverUrl)', 'success');
        }
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func isServerReachable(urlStr: String, timeout: TimeInterval) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var reachable = false
        
        guard let url = URL(string: urlStr + "/api/server-info") else { return false }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                reachable = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + timeout)
        return reachable
    }

    // MARK: - Helpers

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func showToast(message: String) {
        let toastLabel = UILabel()
        toastLabel.backgroundColor = UIColor.black.withAlphaComponent(0.8)
        toastLabel.textColor = .white
        toastLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        toastLabel.textAlignment = .center
        toastLabel.text = message
        toastLabel.alpha = 0
        toastLabel.layer.cornerRadius = 12
        toastLabel.clipsToBounds = true
        toastLabel.numberOfLines = 0

        let maxWidth = view.frame.width - 48
        let size = toastLabel.sizeThatFits(CGSize(width: maxWidth, height: CGFloat.greatestFiniteMagnitude))
        toastLabel.frame = CGRect(
            x: (view.frame.width - min(size.width + 32, maxWidth)) / 2,
            y: view.frame.height - 120,
            width: min(size.width + 32, maxWidth),
            height: size.height + 20
        )
        view.addSubview(toastLabel)

        UIView.animate(withDuration: 0.3, animations: {
            toastLabel.alpha = 1
        }) { _ in
            UIView.animate(withDuration: 0.3, delay: 2.0, options: [], animations: {
                toastLabel.alpha = 0
            }) { _ in
                toastLabel.removeFromSuperview()
            }
        }
    }
}

// MARK: - WKScriptMessageHandler (JavaScript Bridge)

extension ViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "iOSBridge",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "startAutoDiscovery":
            autoDiscoverServer()
        default:
            print("⚠️ iOSBridge: Unknown action '\(action)'")
        }
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let urlString = url.absoluteString

        // Chặn tải file APK (không cần trên iOS)
        if urlString.hasSuffix(".apk") || urlString.contains("OT-Manager-mobile.apk") {
            showToast(message: "Bản cập nhật APK chỉ dành cho Android.")
            decisionHandler(.cancel)
            return
        }

        // Mở link ngoài (http/https không phải server nội bộ) bằng Safari
        if url.scheme == "http" || url.scheme == "https" {
            if navigationAction.navigationType == .linkActivated {
                // Chỉ mở bằng Safari nếu là link do người dùng click
                // và không phải API call
                 var isInternal = urlString.contains("onrender.com") ||
                                  urlString.contains("otmanager.id.vn") ||
                                  urlString.contains("localhost") ||
                                  urlString.contains("127.0.0.1") ||
                                  urlString.contains("192.168.") ||
                                  urlString.contains("10.") ||
                                  urlString.contains("169.254.")
                 
                 if !isInternal {
                     if urlString.range(of: "172\\.(1[6-9]|2[0-9]|3[0-1])\\.", options: .regularExpression) != nil {
                         isInternal = true
                     }
                 }
                 
                 let isExternalLink = !isInternal
                 if isExternalLink {
                     UIApplication.shared.open(url)
                     decisionHandler(.cancel)
                     return
                 }
            }
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Ẩn splash screen sau khi tải xong
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("❌ WebView navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - WKUIDelegate (Alert/Confirm/Prompt)

extension ViewController: WKUIDelegate {

    // JavaScript alert() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // JavaScript confirm() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    // JavaScript prompt() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel) { _ in
            completionHandler(nil)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}
